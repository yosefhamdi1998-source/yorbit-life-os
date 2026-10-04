import { entities } from './entitiesFixture';
const fixtureScenario = () => new URLSearchParams(globalThis.location?.search || '').get('scenario');
const unavailable = async () => { throw new Error('External actions are disabled in this synthetic preview.'); };
export const base44 = {
  entities,
  auth: { me: async () => ({id:'fixture-user',email:'fixture@example.test',onboarding_completed_at:'2026-09-01'}), isAuthenticated:async()=>true, getSession:async()=>(fixtureScenario()==='login-unconfirmed'?null:{user:{id:'fixture-user'}}), loginViaEmailPassword:async()=>{const e=new Error('Email not confirmed');e.code='email_not_confirmed';throw e;}, resendOtp:async(email)=>{globalThis.__fixtureResends=[...(globalThis.__fixtureResends||[]),email];}, resetPasswordRequest:async(email)=>{
      const attempts = globalThis.__fixtureResetRequests = [...(globalThis.__fixtureResetRequests || []), email];
      if (fixtureScenario() === 'reset-request-retry' && attempts.length === 1) {
        throw new Error('Synthetic email service failure');
      }
      if (fixtureScenario() !== 'reset-request-retry' && fixtureScenario() !== 'reset-request-success') return unavailable();
    }, onAuthStateChange:()=>()=>{}, logout:async()=>{}, redirectToLogin(){} },
  integrations:{Core:{InvokeLLM:unavailable}}, functions:{invoke:async(name, args)=>{
    const scenario = new URLSearchParams(globalThis.location?.search || '').get('scenario');
    if (scenario === 'bank-recovery' && name === 'plaidSyncTransactions') {
      await entities.ConnectedAccount.update(args.connected_account_id, {sync_status:'reconnect_required',error_message:'Fixture bank requires sign-in again.'});
      throw new Error('Synthetic reconnect required');
    }
    if (scenario === 'bank-recovery' && name === 'plaidDisconnectAccount') {
      // The client applies its own optimistic local removal on success and
      // never re-reads this row, so nothing needs mutating here - and doing
      // so would trip the entity-level 'Synthetic disconnect failure' trap
      // below, which exists to test the failure path, not this one.
      return {success:true};
    }
    return unavailable();
  }},
  agents:{ createConversation:async()=>({id:'fixture-chat',messages:[]}), subscribeToConversation:()=>()=>{}, addMessage:unavailable },
  deleteAllMyData:unavailable,
};
