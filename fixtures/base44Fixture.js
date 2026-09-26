import { entities } from './entitiesFixture';
const unavailable = async () => { throw new Error('External actions are disabled in this synthetic preview.'); };
export const base44 = {
  entities,
  auth: { me: async () => ({id:'fixture-user',email:'fixture@example.test',onboarding_completed_at:'2026-09-01'}), isAuthenticated:async()=>true, getSession:async()=>({user:{id:'fixture-user'}}), onAuthStateChange:()=>()=>{}, logout:async()=>{}, redirectToLogin(){} },
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
