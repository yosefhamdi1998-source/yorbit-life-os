import { entities } from './entitiesFixture';
const unavailable = async () => { throw new Error('External actions are disabled in this synthetic preview.'); };
export const base44 = {
  entities,
  auth: { me: async () => ({id:'fixture-user',email:'fixture@example.test',onboarding_completed_at:'2026-09-01'}), isAuthenticated:async()=>true, getSession:async()=>({user:{id:'fixture-user'}}), onAuthStateChange:()=>()=>{}, logout:async()=>{}, redirectToLogin(){} },
  integrations:{Core:{InvokeLLM:unavailable}}, functions:{invoke:unavailable},
  agents:{ createConversation:async()=>({id:'fixture-chat',messages:[]}), subscribeToConversation:()=>()=>{}, addMessage:unavailable },
  deleteAllMyData:unavailable,
};
