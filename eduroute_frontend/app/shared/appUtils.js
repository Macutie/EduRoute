export const DEFAULT_PROFILE_IMAGE = '/profile_pic.png';
export const GORDON_COLLEGE_EMAIL_DOMAIN = '@gordoncollege.edu.ph';
export const isGordonCollegeEmail = (value = '') => String(value).trim().toLowerCase().endsWith(GORDON_COLLEGE_EMAIL_DOMAIN);
export const isEmailIdentifier = (value = '') => String(value).includes('@');
export const triggerBlobDownload = (blob, filename) => {
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename || 'download';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => {
    window.URL.revokeObjectURL(objectUrl);
  }, 0);
};
