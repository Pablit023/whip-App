import React, { useEffect, useState } from 'react';
// IMPORTANTE: Hemos añadido 'Platform' aquí
import { Audio } from 'expo-av';
import { Accelerometer } from 'expo-sensors';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const SOUNDS = [
  { id: 0, name: 'Látigo', file: require('../../assets/whip.mp3') },
  { id: 1, name: 'Campana', file: require('../../assets/bell.mp3') },
  { id: 2, name: 'Láser', file: require('../../assets/laser.mp3') },
];

export default function App() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isShaking, setIsShaking] = useState(false);

  async function playSound() {
    const soundObject = new Audio.Sound();
    try {
      await soundObject.loadAsync(SOUNDS[currentIndex].file);
      setSound(soundObject);
      await soundObject.playAsync();
    } catch (error) {
      console.log("Error al reproducir:", error);
    }
  }

  useEffect(() => {
    // CONDICIÓN SALVAVIDAS: Si estamos en la web, cancelamos los sensores y no hacemos nada
    if (Platform.OS === 'web') {
      console.log("El acelerómetro no funciona en el PC. ¡Prueba la app en tu teléfono con Expo Go!");
      return; 
    }

    let subscription: any = null;

    Accelerometer.setUpdateInterval(100);
    subscription = Accelerometer.addListener(accelerometerData => {
      const { x, y, z } = accelerometerData;
      const acceleration = Math.sqrt(x * x + y * y + z * z);
      
      if (acceleration > 3.0 && !isShaking) {
        setIsShaking(true);
        playSound();
        setTimeout(() => setIsShaking(false), 800); 
      }
    });

    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, [currentIndex, isShaking]);

  useEffect(() => {
    return sound ? () => { sound.unloadAsync(); } : undefined;
  }, [sound]);

  const nextSound = () => setCurrentIndex((prev) => (prev + 1) % SOUNDS.length);
  const prevSound = () => setCurrentIndex((prev) => (prev === 0 ? SOUNDS.length - 1 : prev - 1));

  return (
    <View style={styles.container}>
      <Text style={styles.title}>¡Agita tu móvil!</Text>
      
      <View style={styles.selector}>
        <TouchableOpacity onPress={prevSound} style={styles.button}>
          <Text style={styles.arrow}>{"<"}</Text>
        </TouchableOpacity>

        <Text style={styles.soundName}>{SOUNDS[currentIndex].name}</Text>

        <TouchableOpacity onPress={nextSound} style={styles.button}>
          <Text style={styles.arrow}>{">"}</Text>
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
    fontSize: 28,
    color: '#fff',
    marginHorizontal: 30,
    minWidth: 120,
    textAlign: 'center',
  }
});