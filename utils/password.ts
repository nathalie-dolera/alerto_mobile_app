export const checkPasswordRules = (password: string) => {
  return {
    hasMinLength: password.length >= 8, 
    hasUpper: /[A-Z]/.test(password),
    hasLower: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSymbol: /[!@#$%^&*(),.?":{}|<>-_ç]/.test(password),
  };
};

export const validateRegistration = (password: string, confirmPassword: string) => {
    
  if (!password || !confirmPassword) {
    return { isValid: false, message: "Please fill in all password fields." };
  }

  if (password !== confirmPassword) {
    return { isValid: false, message: "Passwords do not match!" };
  }

  const rules = checkPasswordRules(password);
  const isPasswordStrong = rules.hasMinLength && rules.hasUpper && rules.hasLower && rules.hasNumber && rules.hasSymbol;

  if (!isPasswordStrong) {
    return { isValid: false, message: "Password is not strong enough. \n\nIt must:\n• Be at least 8 characters long\n• Include uppercase and  lowercase letters\n• Include at least one number\n• Include at least one symbol" };
  }
  return { isValid: true, message: "" };
};