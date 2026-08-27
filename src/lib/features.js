// Feature flags — flip to false to hide/gate features
export const FEATURES = {
  aiBriefing: true,
  aiInsights: true,
  aiCoach: true,
  financialGoals: true,
  bankSync: true,          // Bank sync enabled
  googleLogin: false,      // Requires Google OAuth client configured in Supabase — hide the button until then
  launchChecklist: false,  // dev/internal — set true locally; MUST be false before App Store release
};