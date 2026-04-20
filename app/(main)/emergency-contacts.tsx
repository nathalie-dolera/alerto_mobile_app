import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/color';
import { EmergencyContact, EmergencyService } from '@/services/emergency-service';
import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme
} from 'react-native';

export default function EmergencyContactsScreen() {
  const router = useRouter();
  const theme = useColorScheme() ?? 'light';
  const colors = Colors[theme as 'light' | 'dark'];

  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    setIsLoading(true);
    const data = await EmergencyService.getContacts();
    setContacts(data);
    setIsLoading(false);
  };

  const handleAddPress = () => {
    setIsAdding(true);
    setEditingId(null);
    clearForm();
  };

  const handleEditPress = (contact: EmergencyContact) => {
    setEditingId(contact.id);
    setFirstName(contact.firstName);
    setLastName(contact.lastName);
    setRelationship(contact.relationship);
    setPhoneNumber(contact.phoneNumber);
    setIsAdding(true);
  };

  const clearForm = () => {
    setFirstName('');
    setLastName('');
    setRelationship('');
    setPhoneNumber('');
  };

  const validateForm = () => {
    if (!firstName || !lastName || !relationship || !phoneNumber) {
      Alert.alert("Error", "Please fill in all fields.");
      return false;
    }
    const phoneRegex = /^[0-9]{11}$/;
    if (!phoneRegex.test(phoneNumber)) {
      Alert.alert("Error", "Phone number must be exactly 11 digits.");
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    const newContact: EmergencyContact = {
      id: editingId || Date.now().toString(),
      firstName,
      lastName,
      relationship,
      phoneNumber,
    };

    const success = await EmergencyService.saveContact(newContact);
    if (success) {
      setIsAdding(false);
      clearForm();
      loadContacts();
    } else {
      Alert.alert("Error", "Failed to save contact.");
    }
  };
  
  const handleToggleSelection = async (id: string) => {
    const success = await EmergencyService.toggleSelection(id);
    if (success) {
      loadContacts();
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      "Delete Contact",
      "Are you sure you want to remove this emergency contact?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive", 
          onPress: async () => {
            const success = await EmergencyService.deleteContact(id);
            if (success) loadContacts();
          } 
        }
      ]
    );
  };

  const renderContactItem = ({ item }: { item: EmergencyContact }) => (
    <View style={[styles.contactCard, { backgroundColor: colors.card, borderColor: item.isSelected !== false ? colors.activeCard : colors.hr }]}>
      <TouchableOpacity 
        style={styles.contactInfo} 
        onPress={() => handleToggleSelection(item.id)}
        activeOpacity={0.7}
      >
        <View style={styles.selectionIndicator}>
           <IconSymbol 
            name={item.isSelected !== false ? "checkmark.circle.fill" : "circle"} 
            size={24} 
            color={item.isSelected !== false ? colors.activeCard : colors.subtitle + '40'} 
          />
        </View>
        
        <View style={[styles.avatarCircle, { backgroundColor: (item.isSelected !== false ? colors.activeCard : colors.subtitle) + '20' }]}>
          <Text style={[styles.avatarText, { color: item.isSelected !== false ? colors.activeCard : colors.subtitle }]}>
            {item.firstName[0]}{item.lastName[0]}
          </Text>
        </View>
        <View style={styles.textContainer}>
          <Text style={[styles.contactName, { color: item.isSelected !== false ? colors.text : colors.subtitle }]}>
            {item.firstName} {item.lastName}
          </Text>
          <Text style={[styles.contactRelationship, { color: colors.subtitle }]}>
            {item.relationship} • {item.phoneNumber}
          </Text>
        </View>
      </TouchableOpacity>
      <View style={styles.actionButtons}>
        <TouchableOpacity onPress={() => handleEditPress(item)} style={styles.actionIcon}>
          <IconSymbol name="pencil" size={20} color={colors.subtitle} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.actionIcon}>
          <IconSymbol name="trash" size={20} color={colors.logoutText} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => isAdding ? setIsAdding(false) : router.back()} style={styles.backBtn}>
          <IconSymbol name="chevron.left" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {isAdding ? (editingId ? "Edit Contact" : "Add Contact") : "Emergency Contacts"}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {isAdding ? (
        <KeyboardAvoidingView 
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <ScrollView contentContainerStyle={styles.formContent}>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.subtitle }]}>
                FIRST NAME
              </Text>
              <TextInput 
                style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.hr }]}
                value={firstName}
                onChangeText={setFirstName}
                placeholder="Ex. Juan" placeholderTextColor={colors.subtitle + '80'}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.subtitle }]}>
                LAST NAME
              </Text>
              <TextInput 
                style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.hr }]}
                value={lastName}
                onChangeText={setLastName}
                placeholder="Ex. Dela Cruz"
                placeholderTextColor={colors.subtitle + '80'}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.subtitle }]}>
                RELATIONSHIP
              </Text>
              <TextInput 
                style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.hr }]}
                value={relationship}
                onChangeText={setRelationship}
                placeholder="Ex. Mother, Friend, Spouse"
                placeholderTextColor={colors.subtitle + '80'}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.subtitle }]}>
                CONTACT NUMBER (11 Digits)
              </Text>
              <TextInput 
                style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.hr }]}
                value={phoneNumber}
                onChangeText={(val) => setPhoneNumber(val.replace(/[^0-9]/g, ''))}
                keyboardType="phone-pad"
                maxLength={11}
                placeholder="09XXXXXXXXX"
                placeholderTextColor={colors.subtitle + '80'}
              />
            </View>

            <TouchableOpacity 
              style={[styles.saveButton, { backgroundColor: colors.activeCard }]}
              onPress={handleSave}
            >
              <Text style={styles.saveButtonText}>
                Save Emergency Contact
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.cancelButton]}
              onPress={() => setIsAdding(false)}
            >
              <Text style={[styles.cancelButtonText, { color: colors.subtitle }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        <View style={{ flex: 1 }}>
          {isLoading ? (
            <ActivityIndicator size="large" color={colors.activeCard} style={{ marginTop: 40 }} />
          ) : (
            <FlatList 
              data={contacts}
              renderItem={renderContactItem}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <IconSymbol name="person.crop.circle.badge.plus" size={60} color={colors.subtitle + '40'} />
                  <Text style={[styles.emptyText, { color: colors.subtitle }]}>
                    No emergency contacts added yet.
                  </Text>
                </View>
              }
            />
          )}

          <TouchableOpacity 
            style={[styles.fab, { backgroundColor: colors.activeCard }]}
            onPress={handleAddPress}
          >
            <IconSymbol name="plus" size={30} color={colors.activeText} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    paddingHorizontal: 15, 
    paddingTop: 50, 
    paddingBottom: 20 
  },
  backBtn: { 
    width: 40, 
    height: 40, 
    justifyContent: 'center' 
  },
  headerTitle: { 
    fontSize: 20, 
    fontWeight: 'bold' 
  },
  listContent: { 
    paddingHorizontal: 20, 
    paddingBottom: 100 
  },
  formContent: { 
    paddingHorizontal: 20, 
    paddingTop: 10, 
    paddingBottom: 40 
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    marginBottom: 12,
  },
  contactInfo: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    flex: 1 
  },
  selectionIndicator: { 
    marginRight: 12 
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: { 
    fontSize: 18, 
    fontWeight: 'bold' 
  },
  textContainer: { 
    flex: 1 
  },
  contactName: { 
    fontSize: 16, 
    fontWeight: '600' 
  },
  contactRelationship: { 
    fontSize: 13, 
    marginTop: 2 
  },
  actionButtons: { 
    flexDirection: 'row', 
    alignItems: 'center' 
  },
  actionIcon: { 
    padding: 8, 
    marginLeft: 4 
  },
  emptyContainer: { 
    alignItems: 'center', 
    marginTop: 100 
  },
  emptyText: { marginTop: 16, fontSize: 16, textAlign: 'center' },
  fab: {
    position: 'absolute',
    bottom: 30,
    right: 30,
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  inputGroup: { 
    marginBottom: 20 
  },
  label: { 
    fontSize: 12, 
    fontWeight: '700', 
    marginBottom: 8, 
    letterSpacing: 0.5 
  },
  input: {
    height: 52,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    borderWidth: 1,
  },
  saveButton: {
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  saveButtonText: { 
    color: '#fff', 
    fontSize: 17, 
    fontWeight: 'bold' 
  },
  cancelButton: { 
    height: 50, 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginTop: 10 
  },
  cancelButtonText: { 
    fontSize: 16, 
    fontWeight: '600' 
  },
});
