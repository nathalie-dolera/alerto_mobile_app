import AsyncStorage from '@react-native-async-storage/async-storage';

const LEGACY_CONTACTS_KEY = 'alerto_emergency_contacts';
let _currentUserId: string | null = null;

function getContactsKey(): string {
  return _currentUserId
    ? `alerto_emergency_contacts_${_currentUserId}`
    : LEGACY_CONTACTS_KEY;
}

export interface EmergencyContact {
  id: string;
  firstName: string;
  lastName: string;
  relationship: string;
  phoneNumber: string;
  isSelected?: boolean; 
}

export const EmergencyService = {
  /**
   * Call this whenever the logged-in user changes (on login/logout).
   * On first call per user, migrates legacy (unscoped) contacts to the user-scoped key.
   */
  async setUserId(userId: string | null | undefined): Promise<void> {
    _currentUserId = userId ?? null;
    if (!_currentUserId) return;

    try {
      const userKey = getContactsKey();
      const alreadyMigrated = await AsyncStorage.getItem(userKey);
      if (alreadyMigrated === null) {
        const legacy = await AsyncStorage.getItem(LEGACY_CONTACTS_KEY);
        if (legacy) {
          await AsyncStorage.setItem(userKey, legacy);
        }
      }
    } catch {
      // Migration failure is non-fatal
    }
  },

  async getContacts(): Promise<EmergencyContact[]> {
    try {
      const data = await AsyncStorage.getItem(getContactsKey());
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  async saveContact(contact: EmergencyContact): Promise<boolean> {
    try {
      const contacts = await this.getContacts();
      const index = contacts.findIndex(c => c.id === contact.id);
      
      if (index > -1) {
        contacts[index] = {
          ...contact,
          isSelected: contact.isSelected ?? contacts[index].isSelected ?? true
        };
      } else {
        contacts.push({
          ...contact,
          isSelected: contact.isSelected ?? true
        });
      }

      await AsyncStorage.setItem(getContactsKey(), JSON.stringify(contacts));
      return true;
    } catch {
      return false;
    }
  },

  async deleteContact(id: string): Promise<boolean> {
    try {
      let contacts = await this.getContacts();
      contacts = contacts.filter(c => c.id !== id);
      await AsyncStorage.setItem(getContactsKey(), JSON.stringify(contacts));
      return true;
    } catch {
      return false;
    }
  },

  async toggleSelection(id: string): Promise<boolean> {
    try {
      const contacts = await this.getContacts();
      const index = contacts.findIndex(c => c.id === id);
      
      if (index > -1) {
        contacts[index].isSelected = !(contacts[index].isSelected ?? true);
        await AsyncStorage.setItem(getContactsKey(), JSON.stringify(contacts));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
};
