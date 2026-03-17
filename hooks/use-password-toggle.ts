import { useState } from 'react';

export const usePasswordToggle = () => {
  const [showPassword, setShowPassword] = useState(false);

  const togglePassword = () => {
    if (!showPassword) {
      setShowPassword(true);
      setTimeout(() => setShowPassword(false), 4000);
    } else {
      setShowPassword(false);
    }
  };

  return { showPassword, togglePassword };
};