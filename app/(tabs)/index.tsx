import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import * as DocumentPicker from 'expo-document-picker';
import * as ExpoFS from 'expo-file-system';
import { Accelerometer } from 'expo-sensors';
import React, { useEffect, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const FileSystem: any = ExpoFS;

// 1. Añadimos la propiedad "count" (opcional para que no rompa los audios que ya guardaste antes)
type SoundItem = {
  id: string;
  name: string;
  isDefault?: boolean; 
  uri?: string;
  count?: number; 
};

// 2. Le ponemos 0 por defecto al látigo
const DEFAULT_WHIP: SoundItem = { 
  id: 'default_whip', 
  name: 'Látigo', 
  isDefault: true,
  count: 0
};

export default function App() {
  const [soundsList, setSoundsList] = useState<SoundItem[]>([DEFAULT_WHIP]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isShaking, setIsShaking] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  
  // NUEVO: Estado para saber si estamos viendo el contador General o el Específico
  const [showGlobalCount, setShowGlobalCount] = useState(true);

  useEffect(() => {
    const loadSavedSounds = async () => {
      try {
        const savedData = await AsyncStorage.getItem('@mis_sonidos');
        if (savedData !== null) {
          setSoundsList(JSON.parse(savedData));
        }
      } catch (error) {
        console.log("Error cargando memoria:", error);
      } finally {
        setIsLoaded(true);
      }
    };
    loadSavedSounds();
  }, []);

  useEffect(() => {
    if (isLoaded) {
      AsyncStorage.setItem('@mis_sonidos', JSON.stringify(soundsList));
    }
  }, [soundsList, isLoaded]);

  // NUEVO: Función que suma 1 al contador del sonido actual
  const incrementCount = () => {
    setSoundsList(prevList => {
      const newList = [...prevList];
      const currentItem = newList[currentIndex];
      // Si el sonido es antiguo y no tenía contador, asume que es 0 y le suma 1
      newList[currentIndex] = {
        ...currentItem,
        count: (currentItem.count || 0) + 1
      };
      return newList;
    });
  };

  const pickNewSound = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const fileAsset = result.assets[0];
        const cleanName = fileAsset.name.replace(/\.[^/.]+$/, "");

        const baseFolder = FileSystem.documentDirectory || '';
        const permanentUri = baseFolder + fileAsset.name;
        
        await FileSystem.copyAsync({
          from: fileAsset.uri,
          to: permanentUri
        });

        const newSound: SoundItem = {
          id: Date.now().toString(), 
          name: cleanName,
          uri: permanentUri,
          count: 0 // El nuevo sonido empieza con 0 agitaciones
        };

        setSoundsList([...soundsList, newSound]);
        setCurrentIndex(soundsList.length);
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
        { 
          text: "Sí, borrar", 
          style: "destructive", 
          onPress: () => deleteCurrentSound() 
        }
      ]
    );
  };

  const deleteCurrentSound = async () => {
    const soundToDelete = soundsList[currentIndex];
    
    if (!soundToDelete.isDefault && soundToDelete.uri) {
      try {
        await FileSystem.deleteAsync(soundToDelete.uri, { idempotent: true });
      } catch (error) {
        console.log("Error borrando el archivo físico:", error);
      }
    }

    const newList = soundsList.filter((_, index) => index !== currentIndex);
    setSoundsList(newList);
    if (currentIndex >= newList.length) {
      setCurrentIndex(newList.length - 1);
    }
  };

  async function playSound() {
    if (sound) {
      await sound.unloadAsync();
    }

    const soundObject = new Audio.Sound();
    try {
      const currentSoundData = soundsList[currentIndex];
      
      const source = currentSoundData.isDefault 
        ? require('../../assets/whip.mp3') 
        : { uri: currentSoundData.uri! };

      await soundObject.loadAsync(source);
      setSound(soundObject);
      await soundObject.playAsync();

      setTimeout(async () => {
        try {
          const status = await soundObject.getStatusAsync();
          if (status.isLoaded && status.isPlaying) {
            await soundObject.stopAsync();
          }
        } catch (e) {}
      }, 5000); 

    } catch (error) {
      console.log("Error al reproducir:", error);
    }
  }

  useEffect(() => {
    if (Platform.OS === 'web') return;

    let subscription: any = null;
    Accelerometer.setUpdateInterval(100);
    subscription = Accelerometer.addListener(accelerometerData => {
      const { x, y, z } = accelerometerData;
      const acceleration = Math.sqrt(x * x + y * y + z * z);
      
      if (acceleration > 2.0 && !isShaking) {
        setIsShaking(true);
        playSound();
        incrementCount(); // AÑADIDO: Sumamos 1 justo cuando suena
        setTimeout(() => setIsShaking(false), 800); 
      }
    });

    return () => {
      if (subscription) subscription.remove();
    };
  }, [currentIndex, isShaking, soundsList, sound, isLoaded]);

  useEffect(() => {
    return sound ? () => { sound.unloadAsync(); } : undefined;
  }, [sound]);

  const nextSound = () => setCurrentIndex((prev) => (prev + 1) % soundsList.length);
  const prevSound = () => setCurrentIndex((prev) => (prev === 0 ? soundsList.length - 1 : prev - 1));

  if (!isLoaded) return <View style={styles.container} />;

  // CÁLCULOS MATEMÁTICOS PARA LOS CONTADORES
  // Sumamos los contadores de todos los sonidos para el Global
  const globalCount = soundsList.reduce((sum, item) => sum + (item.count || 0), 0);
  // Cogemos el contador específico del sonido que estamos viendo
  const currentCount = soundsList[currentIndex]?.count || 0;

  return (
    <View style={styles.container}>
      
      {/* NUEVO: Contador interactivo */}
      <TouchableOpacity 
        style={styles.counterContainer} 
        onPress={() => setShowGlobalCount(!showGlobalCount)}
      >
        <Text style={styles.counterLabel}>
          {showGlobalCount ? "Agitaciones Totales" : `Agitaciones: ${soundsList[currentIndex]?.name}`}
        </Text>
        <Text style={styles.counterNumber}>
          {showGlobalCount ? globalCount : currentCount}
        </Text>
      </TouchableOpacity>
      
      <View style={styles.selector}>
        <TouchableOpacity onPress={prevSound} style={styles.button}>
          <Text style={styles.arrow}>{"<"}</Text>
        </TouchableOpacity>

        <Text style={styles.soundName} numberOfLines={1}>
          {soundsList[currentIndex].name}
        </Text>

        <TouchableOpacity onPress={nextSound} style={styles.button}>
          <Text style={styles.arrow}>{">"}</Text>
        </TouchableOpacity>
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e1e1e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Estilos nuevos para el contador
  counterContainer: {
    marginBottom: 60,
    backgroundColor: '#2a2a2a',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 20,
    alignItems: 'center',
    minWidth: 250,
    // Pequeña sombra para darle relieve
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  counterLabel: {
    color: '#aaa',
    fontSize: 16,
    marginBottom: 5,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  counterNumber: {
    color: '#00ffcc',
    fontSize: 48,
    fontWeight: 'bold',
  },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#333',
    padding: 20,
    borderRadius: 15,
    width: '90%',
    justifyContent: 'space-between',
  },
  button: {
    padding: 20,
  },
  arrow: {
    fontSize: 30,
    color: '#00ffcc',
    fontWeight: 'bold',
  },
  soundName: {
    fontSize: 24,
    color: '#fff',
    flex: 1,
    textAlign: 'center',
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    marginTop: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButton: {
    backgroundColor: '#00ffcc',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 25,
    marginRight: 15,
  },
  addButtonText: {
    color: '#1e1e1e',
    fontSize: 18,
    fontWeight: 'bold',
  },
  deleteButton: {
    backgroundColor: '#ff4d4d',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 25,
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  }
});