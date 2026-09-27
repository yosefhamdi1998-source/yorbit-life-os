let attempts = 0;
const scenario = () => new URLSearchParams(window.location.search).get('scenario');
export async function getOfferings() {
  if (scenario() === 'native-retry' && attempts++ === 0) return null;
  return {current:{availablePackages:[{identifier:'$rc_monthly',product:{identifier:'app.yorbit.pro.monthly',subscriptionPeriod:'P1M',priceString:'5,99 €'}}]}};
}
export async function purchasePackage() {
  if (scenario() === 'native-sdk-error') throw new Error('Synthetic SDK rejection');
  if (scenario() === 'native-confirmation-pending') return {isPro:true,serverSyncPending:true,error:null};
  if (scenario() === 'native-confirmed') return {isPro:true,serverSyncPending:false,error:null};
  return {isPro:false,error:null};
}
export async function restorePurchases() {
  if (scenario() === 'native-sdk-error') throw new Error('Synthetic SDK rejection');
  if (scenario() === 'native-confirmation-pending') return {isPro:true,serverSyncPending:true,error:null};
  if (scenario() === 'native-confirmed') return {isPro:true,serverSyncPending:false,error:null};
  return {isPro:false,error:null};
}
export async function checkProEntitlement() { return {isPro:false,plan:'free'}; }
