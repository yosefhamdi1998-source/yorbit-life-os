// Completely replaces the network client in fixture mode.
const user = { id: 'fixture-user', email: 'fixture@example.test' };
const profile = { onboarding_completed_at: '2026-09-01', ai_consent_at: '2026-09-01', ai_consent_version: 1, role: 'user' };
function query() {
  const q = { then: (resolve) => Promise.resolve({ data: [], error: null }).then(resolve), single: async () => ({ data: profile, error: null }), maybeSingle: async () => ({data: profile,error:null}) };
  for (const method of ['select','eq','in','order','limit','insert','update','delete','gte','lte']) q[method] = () => q;
  return q;
}
export const supabase = {
  auth: { getUser: async () => ({data:{user}}), getSession: async () => ({data:{session:{user}}}), onAuthStateChange: () => ({data:{subscription:{unsubscribe(){}}}}), signOut: async () => ({error:null}) },
  from: query, rpc: async () => ({data:[],error:null}),
  functions: { invoke: async () => ({data:null,error:{message:'External actions are disabled in this synthetic preview.'}}) },
  channel: () => ({ on() {return this;}, subscribe(){return this;}, unsubscribe(){} }), removeChannel() {},
};
