const IPROG_API_TOKEN = process.env.EXPO_PUBLIC_IPROG_API_TOKEN || "";
const IPROG_ENDPOINT = "https://www.iprogsms.com/api/v1/sms_messages";

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

export const SmsService = {
  async sendSms(phoneNumber: string, message: string, smsProvider: number = 0): Promise<SmsResult> {
    try {
      if (!IPROG_API_TOKEN) {
        return {
          success: false,
          error: "Missing EXPO_PUBLIC_IPROG_API_TOKEN. Add your IPROG token to alerto_frontend_mobile/.env and restart Expo.",
        };
      }

      const formattedPhone = normalizePhilippineMobileNumber(phoneNumber);
      if (!/^639\d{9}$/.test(formattedPhone)) {
        return {
          success: false,
          error: "Invalid Philippine mobile number. Use 09XXXXXXXXX or 639XXXXXXXXX.",
        };
      }

      const params = new URLSearchParams({
        api_token: IPROG_API_TOKEN,
        phone_number: formattedPhone,
        message,
        sms_provider: String(smsProvider),
      });

      const response = await fetch(`${IPROG_ENDPOINT}?${params.toString()}`, {
        method: "POST",
        headers: {
          Accept: "application/json",
        },
      });

      const text = await response.text();
      const data = parseProviderResponse(text);
      const jsonStatus = typeof data.status === 'number' ? data.status : (typeof data.status === 'string' ? parseInt(data.status, 10) : -1);

      if (response.ok && (jsonStatus === 200 || data.status === "success")) {
        return {
          success: true,
          messageId: typeof data.message_id === "string" ? data.message_id : undefined,
        };
      }

      const providerMessage = data.message || data.error;
      let errorText: string;
      if (typeof providerMessage === "string") {
        errorText = providerMessage;
      } else if (Array.isArray(providerMessage)) {
        errorText = providerMessage.join(". ");
      } else {
        errorText = `IPROG request failed (status ${jsonStatus !== -1 ? jsonStatus : response.status})`;
      }

      return {
        success: false,
        error: errorText,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unable to send SMS",
      };
    }
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
    msg += `Plate: ${details.plateNumber}\n`;
    msg += `Driver: ${details.driverName}\n`;

    if (details.screenshotUrl) {
      msg += `Booking Screenshot: ${details.screenshotUrl}\n`;
    }

    if (details.locationUrl) {
      msg += `Current Location: ${details.locationUrl}`;
    }

    return msg;
  }
};
