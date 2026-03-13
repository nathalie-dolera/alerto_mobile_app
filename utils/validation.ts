export const validateRegistration = (password: string, confirmPassword: string) => {
    
  if (!password || !confirmPassword) {
    return { isValid: false, message: "Please fill in all password fields." };
  }

  if (password !== confirmPassword) {
    return { isValid: false, message: "Passwords do not match!" };
  }

  if (password.length < 6) {
    return { isValid: false, message: "Password must be at least 6 characters." };
  }

  return { isValid: true, message: "" };
};