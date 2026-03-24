const API_URL = process.env.EXPO_PUBLIC_API_URL

export interface SavedPlaceData {
  id?: string;
  name: string;
  lat: number;
  lng: number;
  distance: string;
  intensity: string;
  duration: number;
  userId: string;
}

export const SavedPlacesService = {
  //get saved places
  async getAll(userId: string): Promise<SavedPlaceData[]> {
    const response = await fetch(`${API_URL}/saved-places?userId=${userId}`);
    if (!response.ok) throw new Error('Failed to fetch places');
    return response.json();
  },

  //get saved places by id
  async getById(id: string): Promise<SavedPlaceData> {
    const response = await fetch(`${API_URL}/saved-places/${id}`);
    if (!response.ok) throw new Error('Failed to fetch the specific place');
    return response.json();
  },

  //create new for add new place button
  async create(data: SavedPlaceData): Promise<SavedPlaceData> {
    const response = await fetch(`${API_URL}/saved-places`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to save place');
    return response.json();
  },

  //for update
  async update(id: string, data: Partial<SavedPlaceData>): Promise<SavedPlaceData> {
    const response = await fetch(`${API_URL}/saved-places/${id}`, {
      method: 'PUT', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to update place');
    return response.json();
  },

  //for delete
  async delete(id: string): Promise<void> {
    const response = await fetch(`${API_URL}/saved-places/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete place');
  }
};