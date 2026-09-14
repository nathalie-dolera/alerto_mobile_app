const IPROG_API_TOKEN = process.env.EXPO_PUBLIC_IPROG_API_TOKEN || "";
const IPROG_ENDPOINT = "https://iprogsms.com/api/v1/sms_messages";

type SmsResult = {
  success: true;
  messageId?: string;
} | {
  success: false;
  error: string;
};

function normalizePhilippineMobileNumber(phoneNumber: string) {
  const digits = phoneNumber.trim().replace(/[^\d+]/g, "").replace(/^\+/, "");

  if (digits.startsWith("09") && digits.length === 11) {
    return `63${digits.slice(1)}`;
  }

  if (digits.startsWith("9") && digits.length === 10) {
    return `63${digits}`;
  }

  if (digits.startsWith("63") && digits.length === 12) {
    return digits;
  }

  return digits;
}

function parseProviderResponse(text: string) {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { message: text };
  }
}

let lastSentTime = 0;

export const SmsService = {
  async sendSms(phoneNumber: string, message: string, smsProvider: number = 0): Promise<SmsResult> {
    if (!IPROG_API_TOKEN) {
      console.warn("⚠️ SmsService: Missing EXPO_PUBLIC_IPROG_API_TOKEN in environment.");
      return {
        success: false,
        error: "Missing EXPO_PUBLIC_IPROG_API_TOKEN. Add your IPROG token to alerto_frontend_mobile/.env and restart Expo.",
      };
    }

    const formattedPhone = normalizePhilippineMobileNumber(phoneNumber);
    if (!/^639\d{9}$/.test(formattedPhone)) {
      console.warn(`⚠️ SmsService: Invalid phone number format: ${phoneNumber} -> ${formattedPhone}`);
      return {
        success: false,
        error: "Invalid Philippine mobile number. Use 09XXXXXXXXX or 639XXXXXXXXX.",
      };
    }

    let lastError = "";
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // 1. Spacing check (guarantee 1.5 seconds gap globally between any SMS dispatches)
      const now = Date.now();
      const elapsed = now - lastSentTime;
      const minGap = 1500;
      if (elapsed < minGap) {
        await new Promise(resolve => setTimeout(resolve, minGap - elapsed));
      }
      lastSentTime = Date.now();

      // Alternate providers if the first attempt fails
      const activeProvider = attempt > 1 ? (smsProvider === 0 ? 1 : 0) : smsProvider;

      try {
        const params = new URLSearchParams({
          api_token: IPROG_API_TOKEN,
          phone_number: formattedPhone,
          message,
          sms_provider: String(activeProvider),
        });

        // Use 8-second timeout to prevent indefinite hangs
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(`${IPROG_ENDPOINT}?${params.toString()}`, {
          method: "POST",
          headers: {
            Accept: "application/json",
          },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        const text = await response.text();
        const data = parseProviderResponse(text);
        const jsonStatus = typeof data.status === 'number'
          ? data.status
          : (typeof data.status === 'string' ? parseInt(data.status, 10) : -1);

        if (response.ok && (jsonStatus === 200 || data.status === "success")) {
          console.log(`✅ SMS successfully dispatched to ${formattedPhone} (id: ${data.message_id || 'N/A'})`);
          return {
            success: true,
            messageId: typeof data.message_id === "string" ? data.message_id : undefined,
          };
        }

        const providerMessage = data.message || data.error;
        if (typeof providerMessage === "string") {
          lastError = providerMessage;
        } else if (Array.isArray(providerMessage)) {
          lastError = providerMessage.join(". ");
        } else {
          lastError = `IPROG failed (status ${jsonStatus !== -1 ? jsonStatus : response.status})`;
        }

        console.warn(`⚠️ SMS attempt ${attempt} to ${formattedPhone} failed:`, lastError);

        // If Smart/TNT network restriction, retrying won't change provider rules
        if (typeof lastError === 'string' && lastError.includes("Smart/TNT networks do not accept shared sender names")) {
          return {
            success: false,
            error: `Carrier restriction: ${lastError}`,
          };
        }
      } catch (error: unknown) {
        lastError = error instanceof Error ? error.message : "Network error";
        console.warn(`⚠️ SMS attempt ${attempt} to ${formattedPhone} exception:`, lastError);
      }

      if (attempt < maxAttempts) {
        // Wait 1.5 seconds before retrying
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }

    return {
      success: false,
      error: `Failed after ${maxAttempts} attempts. Last error: ${lastError}`,
    };
  },

  async sendSmsToMultipleContacts(
    phoneNumbers: string[],
    message: string,
    delayMs: number = 1500
  ): Promise<SmsResult[]> {
    const results: SmsResult[] = [];
    for (let i = 0; i < phoneNumbers.length; i += 1) {
      const res = await this.sendSms(phoneNumbers[i], message);
      results.push(res);
    }
    return results;
  },

  formatEmergencyMessage(details: {
    bookingType: string;
    plateNumber: string;
    driverName: string;
    carModel?: string;
    screenshotUrl?: string;
    locationUrl?: string;
    senderName?: string;
    senderEmail?: string;
    isEmergency?: boolean;
    incidentReason?: string;
  }) {
    const name = details.senderName || "User";
    const email = details.senderEmail ? ` (${details.senderEmail})` : "";
    const app = details.bookingType || "Ride";

    let msg = details.isEmergency
      ? `ALERTO, Emergency! ${name}${email} in a ${app}.\n\n`
      : `ALERTO! ${name}${email} in a ${app}.\n\n`;

    if (details.carModel && details.carModel !== "N/A") {
      msg += `Vehicle: ${details.carModel}\n`;
    }
    if (details.incidentReason) {
      msg += `Trigger: ${details.incidentReason}\n`;
    }
    if (details.plateNumber && details.plateNumber !== "NONE" && details.plateNumber !== "N/A") {
      msg += `Plate: ${details.plateNumber}\n`;
    }
    if (details.driverName && details.driverName !== "N/A" && details.driverName !== "None" && details.driverName !== "NONE") {
      msg += `Driver: ${details.driverName}\n`;
    }

    if (details.screenshotUrl) {
      msg += `Booking Screenshot: ${details.screenshotUrl}\n`;
    }

    if (details.locationUrl) {
      msg += `Current Location: ${details.locationUrl}`;
    }

    return msg;
  }
};
