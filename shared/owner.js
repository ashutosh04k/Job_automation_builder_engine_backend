// The account allowed to use the legacy global uploads/my_resume.pdf.
// Configured via env so no personal email lives in code.
export function isPrimaryUser(email = '') {
  const owner = (process.env.PRIMARY_USER_EMAIL || '').trim().toLowerCase();
  return Boolean(owner) && String(email || '').trim().toLowerCase() === owner;
}