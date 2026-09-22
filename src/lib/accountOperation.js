// Bind a long-running operation to the account that started it. Cancellation
// stays latched even if the user switches away and back before a request ends.
export function createAccountOperation(auth, expectedUserId) {
  let cancelled = !expectedUserId;
  const unsubscribe = auth.onAuthStateChange(session => {
    if (session?.user?.id !== expectedUserId) cancelled = true;
  });
  const rejectChangedAccount = () => {
    const error = new Error('Your signed-in account changed. Start again from the account you want to use.');
    error.code = 'ACCOUNT_CHANGED';
    throw error;
  };
  return {
    async assertCurrent() {
      if (cancelled) rejectChangedAccount();
      const session = await auth.getSession();
      if (cancelled || session?.user?.id !== expectedUserId) {
        cancelled = true;
        rejectChangedAccount();
      }
    },
    dispose() { unsubscribe?.(); },
  };
}
