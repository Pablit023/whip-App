import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import * as DocumentPicker from 'expo-document-picker';
import * as ExpoFS from 'expo-file-system/legacy';
import { Accelerometer } from 'expo-sensors';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const FileSystem: any = ExpoFS;

type SoundItem = {
  id: string;
  name: string;
  isDefault?: boolean; 
  uri?: string;
  count?: number; 
};

const DEFAULT_WHIP: SoundItem = { 
  id: 'default_whip', 
  name: 'Látigo', 
  isDefault: true,
  count: 0
};

export default function App() {
  const [soundsList, setSoundsList] = useState<SoundItem[]>([DEFAULT_WHIP]);
  const [globalShakeCount, setGlobalShakeCount] = useState(0); 
  const [currentIndex, setCurrentIndex] = useState(0);
  
  // SOLUCIÓN: Usamos useRef en lugar de useState para el sonido. ¡A prueba de fallos!
  const soundRef = useRef<Audio.Sound | null>(null);
  
  const [isShaking, setIsShaking] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showGlobalCount, setShowGlobalCount] = useState(true);
  const [activeTab, setActiveTab] = useState<'shake' | 'list'>('shake');

  useEffect(() => {
    const loadSavedData = async () => {
      try {
        const savedSounds = await AsyncStorage.getItem('@mis_sonidos');
        if (savedSounds !== null) setSoundsList(JSON.parse(savedSounds));
        
        const savedGlobalCount = await AsyncStorage.getItem('@contador_global');
        if (savedGlobalCount !== null) setGlobalShakeCount(parseInt(savedGlobalCount, 10));
      } catch (error) {
        console.log("Error cargando memoria:", error);
      } finally {
        setIsLoaded(true);
      }
    };
    loadSavedData();
  }, []);

  useEffect(() => {
    if (isLoaded) {
      AsyncStorage.setItem('@mis_sonidos', JSON.stringify(soundsList));
      AsyncStorage.setItem('@contador_global', globalShakeCount.toString());
    }
  }, [soundsList, globalShakeCount, isLoaded]);

  const incrementCount = (indexToIncrement: number) => {
    setGlobalShakeCount(prev => prev + 1);
    setSoundsList(prevList => {
      const newList = [...prevList];
      const currentItem = newList[indexToIncrement];
      newList[indexToIncrement] = {
        ...currentItem,
        count: (currentItem.count || 0) + 1
      };
      return newList;
    });
  };

  const pickNewSound = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const fileAsset = result.assets[0];
        const cleanName = fileAsset.name.replace(/\.[^/.]+$/, "");
        const baseFolder = FileSystem.documentDirectory || '';
        const permanentUri = baseFolder + fileAsset.name;
        
        await FileSystem.copyAsync({ from: fileAsset.uri, to: permanentUri });

        const newSound: SoundItem = {
          id: Date.now().toString(), 
          name: cleanName,
          uri: permanentUri,
          count: 0 
        };

        setSoundsList([...soundsList, newSound]);
        setCurrentIndex(soundsList.length);
        setActiveTab('shake');
      }
    } catch (error) {
      console.log("Error al seleccionar:", error);
    }
  };

  const confirmDelete = () => {
    if (soundsList.length <= 1) {
      Alert.alert("¡Espera!", "No puedes quedarte sin sonidos.");
      return;
    }
    Alert.alert(
      "Borrar sonido",
      `¿Seguro que quieres borrar "${soundsList[currentIndex].name}"?`,
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Sí, borrar", style: "destructive", onPress: () => deleteCurrentSound() }
      ]
    );
  };

  const deleteCurrentSound = async () => {
    const soundToDelete = soundsList[currentIndex];
    if (!soundToDelete.isDefault && soundToDelete.uri) {
      try { await FileSystem.deleteAsync(soundToDelete.uri, { idempotent: true }); } 
      catch (error) {}
    }
    const newList = soundsList.filter((_, index) => index !== currentIndex);
    setSoundsList(newList);
    if (currentIndex >= newList.length) setCurrentIndex(newList.length - 1);
  };

  async function playSound(indexToPlay: number) {
    // 1. Limpiamos con cuidado el sonido anterior usando la Referencia
    if (soundRef.current) {
      try {
        await soundRef.current.unloadAsync();
      } catch (e) {} // Ignoramos si ya estaba descargado
    }

    const soundObject = new Audio.Sound();
    soundRef.current = soundObject; // Guardamos el nuevo reproductor

    try {
      const currentSoundData = soundsList[indexToPlay];
      const source = currentSoundData.isDefault 
        ? require('../../assets/whip.mp3') 
        : { uri: currentSoundData.uri! };

      await soundObject.loadAsync(source);
      await soundObject.playAsync();

      setTimeout(async () => {
        try {
          const status = await soundObject.getStatusAsync();
          if (status.isLoaded && status.isPlaying) await soundObject.stopAsync();
        } catch (e) {}
      }, 5000); 

    } catch (error) {}
  }

  const playManualSound = (index: number) => {
    setCurrentIndex(index);
    playSound(index);
    incrementCount(index);
  };

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let subscription: any = null;
    Accelerometer.setUpdateInterval(100);
    subscription = Accelerometer.addListener(accelerometerData => {
      const { x, y, z } = accelerometerData;
      const acceleration = Math.sqrt(x * x + y * y + z * z);
      
      if (acceleration > 2.0 && !isShaking) {
        setIsShaking(true);
        playSound(currentIndex);
        incrementCount(currentIndex);
        setTimeout(() => setIsShaking(false), 800); 
      }
    });
    return () => { if (subscription) subscription.remove(); };
  }, [currentIndex, isShaking, soundsList, isLoaded]);

  // Limpiador final seguro cuando la app se cierra por completo
  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
      }
    };
  }, []);

  const nextSound = () => setCurrentIndex((prev) => (prev + 1) % soundsList.length);
  const prevSound = () => setCurrentIndex((prev) => (prev === 0 ? soundsList.length - 1 : prev - 1));

  if (!isLoaded) return <View style={styles.mainWrapper} />;

  const currentCount = soundsList[currentIndex]?.count || 0;

  return (
    <View style={styles.mainWrapper}>
      
      <View style={styles.contentArea}>
        {activeTab === 'shake' ? (
          <View style={styles.tabContent}>
            <TouchableOpacity style={styles.counterContainer} onPress={() => setShowGlobalCount(!showGlobalCount)}>
              <Text style={styles.counterLabel}>
                {showGlobalCount ? "Agitaciones Totales" : `Agitaciones: ${soundsList[currentIndex]?.name}`}
              </Text>
              <Text style={styles.counterNumber}>
                {showGlobalCount ? globalShakeCount : currentCount}
              </Text>
            </TouchableOpacity>
            
            <View style={styles.selector}>
              <TouchableOpacity onPress={prevSound} style={styles.button}><Text style={styles.arrow}>{"<"}</Text></TouchableOpacity>
              <Text style={styles.soundName} numberOfLines={1}>{soundsList[currentIndex].name}</Text>
              <TouchableOpacity onPress={nextSound} style={styles.button}><Text style={styles.arrow}>{">"}</Text></TouchableOpacity>
            </View>

            <View style={styles.actionButtonsContainer}>
              <TouchableOpacity onPress={pickNewSound} style={styles.addButton}>
                <Text style={styles.addButtonText}>+ Añadir</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmDelete} style={styles.deleteButton}>
                <Text style={styles.deleteButtonText}>🗑️ Borrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.tabContent}>
            <Text style={styles.listTitle}>Mis Sonidos</Text>
            <ScrollView style={styles.scrollContainer}>
              {soundsList.map((item, index) => (
                <View key={item.id} style={styles.listItem}>
                  <View style={styles.listItemTextContainer}>
                    <Text style={styles.listItemName}>{item.name}</Text>
                    <Text style={styles.listItemCount}>Usado {item.count || 0} veces</Text>
                  </View>
                  
                  <TouchableOpacity onPress={() => playManualSound(index)} style={styles.playButton}>
                    <Text style={styles.playButtonText}>▶️</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
            
            <TouchableOpacity onPress={pickNewSound} style={[styles.addButton, { marginTop: 20, marginBottom: 20 }]}>
              <Text style={styles.addButtonText}>+ Añadir Sonido</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.bottomBar}>
        <TouchableOpacity style={[styles.tabButton, activeTab === 'shake' && styles.tabButtonActive]} onPress={() => setActiveTab('shake')}>
          <Text style={[styles.tabButtonText, activeTab === 'shake' && styles.tabButtonTextActive]}>📱 Agitar</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.tabButton, activeTab === 'list' && styles.tabButtonActive]} onPress={() => setActiveTab('list')}>
          <Text style={[styles.tabButtonText, activeTab === 'list' && styles.tabButtonTextActive]}>🎵 Lista</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mainWrapper: { flex: 1, backgroundColor: '#1e1e1e' },
  contentArea: { flex: 1 },
  tabContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 50 },
  counterContainer: { marginBottom: 60, backgroundColor: '#2a2a2a', paddingVertical: 15, paddingHorizontal: 30, borderRadius: 20, alignItems: 'center', minWidth: 250, elevation: 5 },
  counterLabel: { color: '#aaa', fontSize: 16, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 1 },
  counterNumber: { color: '#00ffcc', fontSize: 48, fontWeight: 'bold' },
  selector: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#333', padding: 20, borderRadius: 15, width: '90%', justifyContent: 'space-between' },
  button: { padding: 20 },
  arrow: { fontSize: 30, color: '#00ffcc', fontWeight: 'bold' },
  soundName: { fontSize: 24, color: '#fff', flex: 1, textAlign: 'center' },
  actionButtonsContainer: { flexDirection: 'row', marginTop: 40, justifyContent: 'center', alignItems: 'center' },
  addButton: { backgroundColor: '#00ffcc', paddingVertical: 12, paddingHorizontal: 25, borderRadius: 25, marginRight: 15 },
  addButtonText: { color: '#1e1e1e', fontSize: 18, fontWeight: 'bold' },
  deleteButton: { backgroundColor: '#ff4d4d', paddingVertical: 12, paddingHorizontal: 25, borderRadius: 25 },
  deleteButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  listTitle: { fontSize: 28, color: '#00ffcc', fontWeight: 'bold', marginBottom: 20 },
  scrollContainer: { width: '100%', paddingHorizontal: 20 },
  listItem: { flexDirection: 'row', backgroundColor: '#333', padding: 15, marginBottom: 10, borderRadius: 15, alignItems: 'center', justifyContent: 'space-between' },
  listItemTextContainer: { flex: 1 },
  listItemName: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  listItemCount: { color: '#aaa', fontSize: 14, marginTop: 4 },
  playButton: { backgroundColor: '#444', padding: 15, borderRadius: 50, marginLeft: 15 },
  playButtonText: { fontSize: 20 },
  bottomBar: { flexDirection: 'row', height: 70, backgroundColor: '#2a2a2a', borderTopWidth: 1, borderTopColor: '#444' },
  tabButton: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabButtonActive: { borderTopWidth: 3, borderTopColor: '#00ffcc' },
  tabButtonText: { color: '#888', fontSize: 16, fontWeight: 'bold' },
  tabButtonTextActive: { color: '#00ffcc' }
});