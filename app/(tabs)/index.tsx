import React, { useEffect, useState } from 'react';
// NUEVO: Importamos Alert para las ventanas de confirmación
import { Audio } from 'expo-av';
import * as DocumentPicker from 'expo-document-picker';
import { Accelerometer } from 'expo-sensors';
import { Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const INITIAL_SOUNDS = [
  { id: 0, name: 'Látigo', file: require('../../assets/whip.mp3') },
  { id: 1, name: 'Campana', file: require('../../assets/bell.mp3') },
  { id: 2, name: 'Láser', file: require('../../assets/laser.mp3') },
];

export default function App() {
  const [soundsList, setSoundsList] = useState(INITIAL_SOUNDS);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isShaking, setIsShaking] = useState(false);

  const pickNewSound = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const fileAsset = result.assets[0];
        const cleanName = fileAsset.name.replace(/\.[^/.]+$/, "");

        const newSound = {
          // Usamos Date.now() para que el ID sea siempre único, incluso si borramos otros
          id: Date.now(), 
          name: cleanName,
          file: { uri: fileAsset.uri } 
        };

        setSoundsList([...soundsList, newSound]);
        setCurrentIndex(soundsList.length);
      }
    } catch (error) {
      console.log("Error al seleccionar:", error);
    }
  };

  // NUEVO: Función para confirmar el borrado
  const confirmDelete = () => {
    // Si solo queda un sonido, no dejamos borrarlo para que la app no explote
    if (soundsList.length <= 1) {
      Alert.alert(
        "¡Espera!", 
        "No puedes quedarte sin sonidos. Añade uno nuevo antes de borrar este."
      );
      return;
    }

    // Ventana de confirmación nativa
    Alert.alert(
      "Borrar sonido",
      `¿Seguro que quieres borrar "${soundsList[currentIndex].name}"?`,
      [
        { 
          text: "Cancelar", 
          style: "cancel" // En iOS esto pone el botón en gris
        },
        { 
          text: "Sí, borrar", 
          style: "destructive", // En iOS esto pone el botón en rojo
          onPress: () => deleteCurrentSound() 
        }
      ]
    );
  };

  // NUEVO: Función que ejecuta el borrado si le damos a "Sí"
  const deleteCurrentSound = () => {
    // Filtramos la lista para quedarnos con todos menos el que estamos viendo
    const newList = soundsList.filter((_, index) => index !== currentIndex);
    setSoundsList(newList);
    
    // Si hemos borrado el último de la lista, movemos el índice uno atrás para no salirnos del límite
    if (currentIndex >= newList.length) {
      setCurrentIndex(newList.length - 1);
    }
  };

  async function playSound() {
    const soundObject = new Audio.Sound();
    try {
      await soundObject.loadAsync(soundsList[currentIndex].file);
      setSound(soundObject);
      await soundObject.playAsync();
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
        setTimeout(() => setIsShaking(false), 800); 
      }
    });

    return () => {
      if (subscription) subscription.remove();
    };
  }, [currentIndex, isShaking, soundsList]);

  useEffect(() => {
    return sound ? () => { sound.unloadAsync(); } : undefined;
  }, [sound]);

  const nextSound = () => setCurrentIndex((prev) => (prev + 1) % soundsList.length);
  const prevSound = () => setCurrentIndex((prev) => (prev === 0 ? soundsList.length - 1 : prev - 1));

  return (
    <View style={styles.container}>
      <Text style={styles.title}>¡Agita tu móvil!</Text>
      
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

      {/* NUEVO: Contenedor para poner los dos botones en fila */}
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
  title: {
    fontSize: 24,
    color: '#fff',
    marginBottom: 50,
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
  // NUEVO: Estilos para la fila de botones inferiores
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
    marginRight: 15, // Da un pequeño espacio a la derecha
  },
  addButtonText: {
    color: '#1e1e1e',
    fontSize: 18,
    fontWeight: 'bold',
  },
  deleteButton: {
    backgroundColor: '#ff4d4d', // Un rojo agradable a la vista
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