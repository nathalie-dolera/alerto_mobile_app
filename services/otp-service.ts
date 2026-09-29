const SENDGRID_API_URL = 'https://api.sendgrid.com/v3/mail/send';
const SENDGRID_API_KEY = process.env.EXPO_PUBLIC_SENDGRID_API_KEY || '';
const SENDGRID_FROM_EMAIL = process.env.EXPO_PUBLIC_SENDGRID_FROM_EMAIL || 'alerto.system2026@gmail.com';

interface OtpData {
  email: string;
  otp: string;
  expiresAt: number;
}

// In-memory cache for active registration OTPs
let currentOtpSession: OtpData | null = null;

export const OtpService = {
  /**
   * Generates a 6-digit OTP, caches it for 10 minutes, and dispatches via SendGrid
   */
  async sendRegistrationOtp(email: string, name: string): Promise<{ success: boolean; error?: string }> {
    try {
      const trimmedEmail = email.trim().toLowerCase();
      const trimmedName = name.trim() || 'User';

      // Generate random 6-digit numerical code
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

      currentOtpSession = {
        email: trimmedEmail,
        otp,
        expiresAt,
      };

      const emailHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; background-color: #ffffff;">
          <div style="background-color: #0b1723; padding: 28px 24px; text-align: center;">
            <h1 style="margin: 0; font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: 2px;">ALERTO</h1>
            <p style="margin: 6px 0 0 0; font-size: 13px; color: #94a3b8; letter-spacing: 0.5px;">SMART PERSONAL SAFETY SYSTEM</p>
          </div>
          
          <div style="padding: 32px 28px; color: #1e293b; text-align: center;">
            <h2 style="margin: 0 0 12px 0; font-size: 20px; font-weight: 700; color: #0f172a;">Verify Your Email Address</h2>
            <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #64748b;">
              Hello <strong style="color: #0f172a;">${trimmedName}</strong>,<br/>
              Thank you for registering with Alerto. Enter this 6-digit verification code in the mobile app to activate your account:
            </p>
            
            <div style="margin: 20px auto; padding: 18px 32px; background-color: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 12px; display: inline-block;">
              <span style="font-size: 36px; font-weight: 800; letter-spacing: 10px; color: #0b1723; font-family: monospace;">${otp}</span>
            </div>
            
            <p style="margin: 24px 0 0 0; font-size: 13px; color: #94a3b8;">
              ⏳ This code is valid for <strong>10 minutes</strong>.
            </p>
            <p style="margin: 8px 0 0 0; font-size: 12px; color: #cbd5e1;">
              If you didn't create an account with Alerto, you can safely ignore this email.
            </p>
          </div>
          
          <div style="background-color: #f8fafc; padding: 16px 24px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8;">
            &copy; ${new Date().getFullYear()} Alerto System. Protecting your daily journeys.
          </div>
        </div>
      `;

      const response = await fetch(SENDGRID_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SENDGRID_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [
            {
              to: [{ email: trimmedEmail }],
              subject: `[Alerto] Your Verification Code: ${otp}`,
            },
          ],
          from: {
            email: SENDGRID_FROM_EMAIL,
            name: 'Alerto System',
          },
          content: [
            {
              type: 'text/html',
              value: emailHtml,
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('SendGrid OTP error:', response.status, errorText);

        let detailedError = 'Failed to send verification email. Please try again later.';
        try {
          const parsed = JSON.parse(errorText);
          const firstMsg = parsed?.errors?.[0]?.message;
          if (firstMsg) {
            if (firstMsg.toLowerCase().includes('maximum credits exceeded')) {
              detailedError = 'Email delivery limit reached on SendGrid. Please renew SendGrid credits or update the API key.';
            } else if (firstMsg.toLowerCase().includes('verified sender identity') || response.status === 403) {
              detailedError = 'SendGrid sender email is unverified. Please verify the sender in SendGrid settings.';
            } else {
              detailedError = `Email delivery service error: ${firstMsg}`;
            }
          }
        } catch {
          // Fallback to default
        }

        return { success: false, error: detailedError };
      }

      console.log(`[OtpService] Sent OTP verification to ${trimmedEmail}`);
      return { success: true };
    } catch (err: any) {
      console.error('Failed to send OTP email:', err);
      return { success: false, error: err.message || 'Unable to send verification email.' };
    }
  },

  /**
   * Verifies the user entered OTP against the cached session
   */
  verifyOtp(email: string, userEnteredOtp: string): { isValid: boolean; error?: string } {
    const trimmedEmail = email.trim().toLowerCase();
    const cleanOtp = userEnteredOtp.trim();

    if (!currentOtpSession || currentOtpSession.email !== trimmedEmail) {
      return { isValid: false, error: 'No active verification code found. Please request a new code.' };
    }

    if (Date.now() > currentOtpSession.expiresAt) {
      currentOtpSession = null;
      return { isValid: false, error: 'Verification code has expired. Please request a new code.' };
    }

    if (currentOtpSession.otp !== cleanOtp) {
      return { isValid: false, error: 'Incorrect verification code. Please check your email and try again.' };
    }

    // Success - invalidate session
    currentOtpSession = null;
    return { isValid: true };
  },

  /**
   * Clears any active OTP session (e.g., when user cancels)
   */
  clearSession() {
    currentOtpSession = null;
  }
};
