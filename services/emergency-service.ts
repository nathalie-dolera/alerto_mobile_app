import AsyncStorage from '@react-native-async-storage/async-storage';

const CONTACTS_STORAGE_KEY = 'alerto_emergency_contacts';

export interface EmergencyContact {
  id: string;
  firstName: string;
  lastName: string;
  relationship: string;
  phoneNumber: string;
  isSelected?: boolean; 
}

export const EmergencyService = {
  async getContacts(): Promise<EmergencyContact[]> {
    try {
      const data = await AsyncStorage.getItem(CONTACTS_STORAGE_KEY);
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

      await AsyncStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(contacts));
      return true;
    } catch {
      return false;
    }
  },

  async deleteContact(id: string): Promise<boolean> {
    try {
      let contacts = await this.getContacts();
      contacts = contacts.filter(c => c.id !== id);
      await AsyncStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(contacts));
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
        await AsyncStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(contacts));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
};
