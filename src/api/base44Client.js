import { supabase } from './supabaseClient';
import { entities } from './entities';

// Subpath the app is served under ('' at a root domain, '/yorbit-life-os'
// on GitHub Pages) - auth redirect URLs must include it or emailed links
// land on a 404.
const APP_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

// Maps the camelCase function names used throughout the app
// (base44.functions.invoke('plaidCreateLinkToken', {...})) to the
// kebab-case slugs Supabase Edge Functions are deployed under.
const FUNCTION_MAP = {
  plaidCreateLinkToken: 'plaid-create-link-token',
  plaidExchangeToken: 'plaid-exchange-token',
  plaidSyncTransactions: 'plaid-sync-transactions',
  plaidSyncHoldings: 'plaid-sync-holdings',
  createCheckout: 'create-checkout',
  customForms: 'custom-forms',
  deleteAccount: 'delete-account',
  saveBill: 'save-bill',
};

// Surface Edge Function errors to the UI without leaking raw provider
// internals (e.g. upstream API billing/key errors serialized as JSON blobs)
// into user-facing toasts. Short, human-written messages pass through.
function friendlyMessage(message, fallback) {
  if (!message) return fallback;
  const internal = /anthropic|openai|api.?key|credit balance|internal server error|non-2xx|\{"type":/i;
  if (internal.test(message) || message.length > 180) return fallback;
  return message;
}

async function invokeFunction(name, body) {
  const slug = FUNCTION_MAP[name] || name;
  const { data, error } = await supabase.functions.invoke(slug, { body: body || {} });
  if (error) {
    // Supabase wraps the Edge Function's JSON error body in error.context; surface it
    // the same way base44.functions.invoke did (throwing an Error with .message).
    let message = error.message;
    try {
      const ctx = await error.context?.json?.();
      if (ctx?.error) message = ctx.error;
    } catch (_) { /* keep default message */ }
    throw new Error(friendlyMessage(message, 'Something went wrong. Please try again in a moment.'));
  }
  return data;
}

// --- integrations.Core.InvokeLLM -------------------------------------------
// Base44's InvokeLLM either returns a plain string, or — when response_json_schema
// is passed — a parsed JSON object matching that schema. The ai-coach Edge Function
// mirrors that contract.
async function invokeLLM({ prompt, response_json_schema }) {
  const { data, error } = await supabase.functions.invoke('ai-coach', {
    body: { mode: 'invoke', prompt, response_json_schema },
  });
  if (error) {
    // Supabase wraps the Edge Function's JSON error body in error.context; surface it
    // the same way invokeFunction does, instead of the generic "non-2xx status" message.
    let message = error.message;
    try {
      const ctx = await error.context?.json?.();
      if (ctx?.error) message = ctx.error;
    } catch (_) { /* keep default message */ }
    throw new Error(friendlyMessage(message, 'The AI coach is temporarily unavailable. Please try again later.'));
  }
  return data.result;
}

// --- agents.* (simplified financial_advisor chat) --------------------------
// Base44's agents SDK is a full hosted-conversation platform. This is a much
// simpler equivalent: a `conversations` + `messages` table (see schema.sql
// addendum in MIGRATION_STEPS.md) plus Supabase Realtime, good enough for the
// single AdvisorChat.jsx use case. It does NOT replicate base44 agents in general.
const agents = {
  async createConversation({ agent_name, metadata }) {
    const { data: userData } = await supabase.auth.getUser();
    const user_id = userData?.user?.id;
    const { data, error } = await supabase
      .from('advisor_conversations')
      .insert({ user_id, agent_name, metadata })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { ...data, messages: [] };
  },

  subscribeToConversation(conversationId, callback) {
    let messages = [];
    const channel = supabase
      .channel(`advisor-messages-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'advisor_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          messages = [...messages, payload.new];
          callback({ messages });
        }
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  },

  async addMessage(conversation, { role, content }) {
    // Insert the user's message directly (RLS: users can only insert into their own conversation),
    // then call the Edge Function to generate + insert the assistant's reply.
    const { data: userData } = await supabase.auth.getUser();
    const user_id = userData?.user?.id;
    const { error: insertError } = await supabase
      .from('advisor_messages')
      .insert({ conversation_id: conversation.id, user_id, role, content });
    if (insertError) throw new Error(insertError.message);

    const { error } = await supabase.functions.invoke('ai-coach', {
      body: { mode: 'advisor_chat', conversation_id: conversation.id },
    });
    if (error) {
      let message = error.message;
      try {
        const ctx = await error.context?.json?.();
        if (ctx?.error) message = ctx.error;
      } catch (_) { /* keep default message */ }
      throw new Error(friendlyMessage(message, 'The AI coach is temporarily unavailable. Please try again later.'));
    }
  },
};

// --- auth --------------------------------------------------------------
const auth = {
  async me() {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) {
      const err = new Error('Not authenticated');
      err.status = 401;
      throw err;
    }
    // Merge in the `role` field from profiles, since app code (e.g. admin checks)
    // reads user.role the way it did from base44.
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single();
    return { ...data.user, role: profile?.role || 'user' };
  },

  // Confirmation and magic links arrive with the session in the URL hash,
  // which supabase-js consumes asynchronously — pages that render before that
  // finishes need to know when it lands.
  onAuthStateChange(callback) {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
    return () => data?.subscription?.unsubscribe();
  },

  async getSession() {
    const { data } = await supabase.auth.getSession();
    return data?.session || null;
  },

  async isAuthenticated() {
    const { data } = await supabase.auth.getSession();
    return !!data?.session;
  },

  async loginViaEmailPassword(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  },

  loginWithProvider(provider, redirectPath = '/') {
    supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}${APP_BASE}${redirectPath}` },
    });
  },

  async register({ email, password }) {
    // Say explicitly where the confirmation link should land. Without this
    // Supabase falls back to the project's Site URL, which drops the user at
    // the domain root — a dead page when the app is served from a subpath.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}${APP_BASE}/login?confirmed=1` },
    });
    if (error) throw new Error(error.message);
    // With email confirmation switched off, Supabase returns a live session
    // here and the account is usable immediately. With it on, session is null
    // and the caller has to fall back to the confirm-your-email step.
    return { session: data?.session || null };
  },

  async verifyOtp({ email, otpCode }) {
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: otpCode,
      type: 'signup',
    });
    if (error) throw new Error(error.message);
    // base44's shape had result.access_token; Supabase's session carries it as access_token too.
    return { access_token: data?.session?.access_token };
  },

  // Supabase manages the session internally once verifyOtp/signIn succeeds —
  // there's no separate token to set, so this is a no-op kept for API compatibility.
  setToken() {},

  async resendOtp(email) {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${window.location.origin}${APP_BASE}/login?confirmed=1` },
    });
    if (error) throw new Error(error.message);
  },

  async resetPasswordRequest(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${APP_BASE}/reset-password`,
    });
    if (error) throw new Error(error.message);
  },

  // NOTE: Supabase's recovery link logs the user into a temporary session automatically
  // when it lands on /reset-password (see supabaseClient.js detectSessionInUrl: true) —
  // there's no separate resetToken to pass. See the rewritten ResetPassword.jsx.
  async resetPassword({ newPassword }) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);
  },

  logout(redirectUrl) {
    supabase.auth.signOut().finally(() => {
      if (redirectUrl) window.location.href = redirectUrl === '/' ? (APP_BASE || '/') : redirectUrl;
    });
  },

  redirectToLogin(returnTo) {
    const encoded = encodeURIComponent(returnTo || window.location.href);
    window.location.href = `${APP_BASE}/login?returnTo=${encoded}`;
  },
};

export const base44 = {
  auth,
  entities,
  functions: { invoke: invokeFunction },
  integrations: { Core: { InvokeLLM: invokeLLM } },
  agents,
};
