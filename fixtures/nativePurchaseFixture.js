let attempts = 0;
const scenario = () => new URLSearchParams(window.location.search).get('scenario');
export async function getOfferings() {
  if (scenario() === 'native-retry' && attempts++ === 0) return null;
  return {current:{availablePackages:[{identifier:'$rc_monthly',product:{identifier:'app.yorbit.pro.monthly',subscriptionPeriod:'P1M',priceString:'5,99 €'}}]}};
}
export async function purchasePackage() { return {isPro:false,error:null}; }
export async function restorePurchases() { return {isPro:false,error:null}; }
export async function checkProEntitlement() { return {isPro:false,plan:'free'}; }
