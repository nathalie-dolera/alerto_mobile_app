const IPROG_API_TOKEN = process.env.EXPO_PUBLIC_IPROG_API_TOKEN || "";
const IPROG_ENDPOINT = 'https://www.iprogsms.com/api/v1/sms_messages';

export const SmsService = {
  async sendSms(phoneNumber: string, message: string, smsProvider: number = 1) {
    try {
      let formattedPhone = phoneNumber.trim();
      if (formattedPhone.startsWith('0')) {
        formattedPhone = '63' + formattedPhone.substring(1);
      }
      const url = `${IPROG_ENDPOINT}?api_token=${IPROG_API_TOKEN}&message=${encodeURIComponent(message)}&phone_number=${formattedPhone}&sms_provider=${smsProvider}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_token: IPROG_API_TOKEN,
          phone_number: formattedPhone,
          message: message,
          sms_provider: smsProvider
        }),
      });

      const data = await response.json();

      if (data.status === 200 || data.status === 'success') {
        return { success: true, messageId: data.message_id };
      } else {
        return { success: false, error: data.message || 'Failed to send SMS' };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
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
