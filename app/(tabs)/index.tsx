import AsyncStorage from '@react-native-async-storage/async-storage';
import Slider from '@react-native-community/slider';
import { Audio } from 'expo-av';
import * as DocumentPicker from 'expo-document-picker';
import * as ExpoFS from 'expo-file-system/legacy';
import { Accelerometer } from 'expo-sensors';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler, Modal, Platform, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';

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
  
  const soundRef = useRef<Audio.Sound | null>(null);
  
  const [isShaking, setIsShaking] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showGlobalCount, setShowGlobalCount] = useState(true);
  const [activeTab, setActiveTab] = useState<'shake' | 'list'>('shake');

  const [isSettingsVisible, setIsSettingsVisible] = useState(false);
  const [volume, setVolume] = useState(1.0); 
  const [duration, setDuration] = useState(5000); 
  const [sensitivity, setSensitivity] = useState(2.0); 
  
  const [isDarkMode, setIsDarkMode] = useState(true);

  // NUEVO: Definimos el color de acento principal dependiendo del modo
  const accentColor = isDarkMode ? '#00ffcc' : '#0044cc';

  const styles = useMemo(() => getStyles(isDarkMode), [isDarkMode]);

  useEffect(() => {
    const loadSavedData = async () => {
      try {
        const savedSounds = await AsyncStorage.getItem('@mis_sonidos');
        if (savedSounds !== null) setSoundsList(JSON.parse(savedSounds));
        
        const savedGlobalCount = await AsyncStorage.getItem('@contador_global');
        if (savedGlobalCount !== null) setGlobalShakeCount(parseInt(savedGlobalCount, 10));

        const savedVol = await AsyncStorage.getItem('@volumen');
        if (savedVol !== null) setVolume(parseFloat(savedVol));

        const savedDur = await AsyncStorage.getItem('@duracion');
        if (savedDur !== null) setDuration(parseInt(savedDur, 10));

        const savedSens = await AsyncStorage.getItem('@sensibilidad');
        if (savedSens !== null) setSensitivity(parseFloat(savedSens));

        const savedTheme = await AsyncStorage.getItem('@tema_oscuro');
        if (savedTheme !== null) setIsDarkMode(savedTheme === 'true');

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
      AsyncStorage.setItem('@volumen', volume.toString());
      AsyncStorage.setItem('@duracion', duration.toString());
      AsyncStorage.setItem('@sensibilidad', sensitivity.toString());
      AsyncStorage.setItem('@tema_oscuro', isDarkMode.toString());
    }
  }, [soundsList, globalShakeCount, volume, duration, sensitivity, isDarkMode, isLoaded]);

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
    if (soundRef.current) {
      try { await soundRef.current.unloadAsync(); } catch (e) {} 
    }

    const soundObject = new Audio.Sound();
    soundRef.current = soundObject; 

    try {
      const currentSoundData = soundsList[indexToPlay];
      const source = currentSoundData.isDefault 
        ? require('../../assets/whip.mp3') 
        : { uri: currentSoundData.uri! };

      await soundObject.loadAsync(source);
      await soundObject.setVolumeAsync(volume);
      await soundObject.playAsync();

      setTimeout(async () => {
        try {
          const status = await soundObject.getStatusAsync();
          if (status.isLoaded && status.isPlaying) await soundObject.stopAsync();
        } catch (e) {}
      }, duration);

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
      
      if (acceleration > sensitivity && !isShaking) {
        setIsShaking(true);
        playSound(currentIndex);
        incrementCount(currentIndex);
        setTimeout(() => setIsShaking(false), 800); 
      }
    });
    return () => { if (subscription) subscription.remove(); };
  }, [currentIndex, isShaking, soundsList, isLoaded, sensitivity, volume, duration]);

  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
      }
    };
  }, []);

  const nextSound = () => setCurrentIndex((prev) => (prev + 1) % soundsList.length);
  const prevSound = () => setCurrentIndex((prev) => (prev === 0 ? soundsList.length - 1 : prev - 1));

  const handleExitApp = () => {
    Alert.alert("Salir", "¿Estás seguro de que quieres cerrar la aplicación?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Salir", style: "destructive", onPress: () => BackHandler.exitApp() }
    ]);
  };

  if (!isLoaded) return <View style={styles.mainWrapper} />;

  const currentCount = soundsList[currentIndex]?.count || 0;

  return (
    <View style={styles.mainWrapper}>
      
      <View style={styles.topBar}>
        <Text style={styles.appTitle}></Text>
        <TouchableOpacity onPress={() => setIsSettingsVisible(true)} style={styles.settingsBtn}>
          <Text style={styles.settingsIcon}>⚙️</Text>
        </TouchableOpacity>
      </View>

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
          <Text style={[styles.tabButtonText, activeTab === 'shake' && styles.tabButtonTextActive]}>Home</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.tabButton, activeTab === 'list' && styles.tabButtonActive]} onPress={() => setActiveTab('list')}>
          <Text style={[styles.tabButtonText, activeTab === 'list' && styles.tabButtonTextActive]}>🎵 Lista</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={isSettingsVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsSettingsVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Ajustes</Text>
            
            <View style={[styles.settingRow, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
              <View>
                <Text style={styles.settingLabel}>Tema de la app</Text>
                <Text style={styles.settingSubLabel}>{isDarkMode ? "Modo Oscuro" : "Modo Claro"}</Text>
              </View>
              <Switch
                value={isDarkMode}
                onValueChange={setIsDarkMode}
                trackColor={{ false: "#ccc", true: accentColor }}
                thumbColor={isDarkMode ? "#1e1e1e" : "#ffffff"}
              />
            </View>

            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Volumen: {Math.round(volume * 100)}%</Text>
              <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={1}
                step={0.05}
                value={volume}
                onValueChange={setVolume}
                minimumTrackTintColor={accentColor}
                maximumTrackTintColor="#555"
                thumbTintColor={accentColor}
              />
            </View>

            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Sensibilidad</Text>
              <Text style={styles.settingSubLabel}>
                {sensitivity < 1.5 ? "Muy sensible" : sensitivity > 3.5 ? "Requiere fuerza" : "Normal"}
              </Text>
              <Slider
                style={styles.slider}
                minimumValue={1.0}
                maximumValue={5.0}
                step={0.1}
                value={sensitivity}
                onValueChange={setSensitivity}
                minimumTrackTintColor={accentColor}
                maximumTrackTintColor="#555"
                thumbTintColor={accentColor}
              />
            </View>

            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Duración del audio: {(duration / 1000).toFixed(1)}s</Text>
              <Slider
                style={styles.slider}
                minimumValue={500}
                maximumValue={20000}
                step={500}
                value={duration}
                onValueChange={setDuration}
                minimumTrackTintColor={accentColor}
                maximumTrackTintColor="#555"
                thumbTintColor={accentColor}
              />
            </View>

            {Platform.OS === 'android' && (
              <TouchableOpacity style={styles.exitBtn} onPress={handleExitApp}>
                <Text style={styles.exitBtnText}>Salir de la aplicación</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.closeBtn} onPress={() => setIsSettingsVisible(false)}>
              <Text style={styles.closeBtnText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const getStyles = (isDarkMode: boolean) => {
  // Lógica de colores condicionales dentro del StyleSheet dinámico
  const accent = isDarkMode ? '#00ffcc' : '#0044cc'; 
  const buttonTextAccent = isDarkMode ? '#1e1e1e' : '#ffffff'; 

  return StyleSheet.create({
    mainWrapper: { flex: 1, backgroundColor: isDarkMode ? '#1e1e1e' : '#f5f5f5' },
    topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 50, paddingBottom: 10, backgroundColor: isDarkMode ? '#2a2a2a' : '#ffffff', borderBottomWidth: 1, borderBottomColor: isDarkMode ? '#444' : '#ddd' },
    appTitle: { color: isDarkMode ? '#fff' : '#1e1e1e', fontSize: 22, fontWeight: 'bold' },
    settingsBtn: { padding: 10 },
    settingsIcon: { fontSize: 24, color: isDarkMode ? '#fff' : '#1e1e1e' },
    
    contentArea: { flex: 1 },
    tabContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 30 },
    counterContainer: { marginBottom: 60, backgroundColor: isDarkMode ? '#2a2a2a' : '#ffffff', paddingVertical: 15, paddingHorizontal: 30, borderRadius: 20, alignItems: 'center', minWidth: 250, elevation: 5, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5, shadowOffset: {width: 0, height: 2} },
    counterLabel: { color: isDarkMode ? '#aaa' : '#666', fontSize: 16, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 1 },
    counterNumber: { color: accent, fontSize: 48, fontWeight: 'bold' }, // Modificado
    selector: { flexDirection: 'row', alignItems: 'center', backgroundColor: isDarkMode ? '#333' : '#ffffff', padding: 20, borderRadius: 15, width: '90%', justifyContent: 'space-between', elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 3, shadowOffset: {width: 0, height: 1} },
    button: { padding: 20 },
    arrow: { fontSize: 30, color: accent, fontWeight: 'bold' }, // Modificado
    soundName: { fontSize: 24, color: isDarkMode ? '#fff' : '#1e1e1e', flex: 1, textAlign: 'center' },
    actionButtonsContainer: { flexDirection: 'row', marginTop: 40, justifyContent: 'center', alignItems: 'center' },
    addButton: { backgroundColor: accent, paddingVertical: 12, paddingHorizontal: 25, borderRadius: 25, marginRight: 15 }, // Modificado
    addButtonText: { color: buttonTextAccent, fontSize: 18, fontWeight: 'bold' }, // Modificado
    deleteButton: { backgroundColor: '#ff4d4d', paddingVertical: 12, paddingHorizontal: 25, borderRadius: 25 },
    deleteButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
    listTitle: { fontSize: 28, color: accent, fontWeight: 'bold', marginBottom: 20 }, // Modificado
    scrollContainer: { width: '100%', paddingHorizontal: 20 },
    listItem: { flexDirection: 'row', backgroundColor: isDarkMode ? '#333' : '#ffffff', padding: 15, marginBottom: 10, borderRadius: 15, alignItems: 'center', justifyContent: 'space-between', elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2, shadowOffset: {width: 0, height: 1} },
    listItemTextContainer: { flex: 1 },
    listItemName: { color: isDarkMode ? '#fff' : '#1e1e1e', fontSize: 20, fontWeight: 'bold' },
    listItemCount: { color: isDarkMode ? '#aaa' : '#666', fontSize: 14, marginTop: 4 },
    playButton: { backgroundColor: isDarkMode ? '#444' : '#f0f0f0', padding: 15, borderRadius: 50, marginLeft: 15 },
    playButtonText: { fontSize: 20 },
    bottomBar: { flexDirection: 'row', height: 70, backgroundColor: isDarkMode ? '#2a2a2a' : '#ffffff', borderTopWidth: 1, borderTopColor: isDarkMode ? '#444' : '#ddd' },
    tabButton: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    tabButtonActive: { borderTopWidth: 3, borderTopColor: accent }, // Modificado
    tabButtonText: { color: isDarkMode ? '#888' : '#aaa', fontSize: 16, fontWeight: 'bold' },
    tabButtonTextActive: { color: accent }, // Modificado

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
    modalContent: { backgroundColor: isDarkMode ? '#2a2a2a' : '#ffffff', width: '85%', borderRadius: 20, padding: 25, elevation: 10 },
    modalTitle: { fontSize: 24, fontWeight: 'bold', color: accent, marginBottom: 20, textAlign: 'center' }, // Modificado
    settingRow: { marginBottom: 25 },
    settingLabel: { color: isDarkMode ? '#fff' : '#1e1e1e', fontSize: 16, marginBottom: 5, fontWeight: '600' },
    settingSubLabel: { color: isDarkMode ? '#aaa' : '#666', fontSize: 12, marginBottom: 10 },
    slider: { width: '100%', height: 40 },
    closeBtn: { backgroundColor: accent, padding: 15, borderRadius: 25, alignItems: 'center', marginTop: 10 }, // Modificado
    closeBtnText: { color: buttonTextAccent, fontSize: 18, fontWeight: 'bold' }, // Modificado
    exitBtn: { backgroundColor: 'transparent', borderWidth: 2, borderColor: '#ff4d4d', padding: 15, borderRadius: 25, alignItems: 'center', marginTop: 10, marginBottom: 15 },
    exitBtnText: { color: '#ff4d4d', fontSize: 18, fontWeight: 'bold' }
  });
};