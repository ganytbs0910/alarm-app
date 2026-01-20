import React, { useState, useRef, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  FlatList,
} from 'react-native';

const Stopwatch = () => {
  const [time, setTime] = useState(0); // ミリ秒
  const [isRunning, setIsRunning] = useState(false);
  const [laps, setLaps] = useState([]);
  const intervalRef = useRef(null);
  const startTimeRef = useRef(0);
  const elapsedRef = useRef(0);

  const formatTime = useCallback((ms) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = Math.floor((ms % 1000) / 10);

    return `${minutes.toString().padStart(2, '0')}:${seconds
      .toString()
      .padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
  }, []);

  const start = useCallback(() => {
    if (isRunning) return;

    setIsRunning(true);
    startTimeRef.current = Date.now() - elapsedRef.current;

    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      elapsedRef.current = elapsed;
      setTime(elapsed);
    }, 10);
  }, [isRunning]);

  const stop = useCallback(() => {
    if (!isRunning) return;

    setIsRunning(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [isRunning]);

  const reset = useCallback(() => {
    stop();
    setTime(0);
    elapsedRef.current = 0;
    setLaps([]);
  }, [stop]);

  const lap = useCallback(() => {
    if (!isRunning) return;

    const lapTime = time;
    const previousLapTotal = laps.length > 0 ? laps[0].total : 0;
    const lapDiff = lapTime - previousLapTotal;

    setLaps((prev) => [
      { id: Date.now(), total: lapTime, diff: lapDiff },
      ...prev,
    ]);
  }, [isRunning, time, laps]);

  const getBestWorstLap = useCallback(() => {
    if (laps.length < 2) return { best: null, worst: null };

    let best = laps[0];
    let worst = laps[0];

    laps.forEach((lapItem) => {
      if (lapItem.diff < best.diff) best = lapItem;
      if (lapItem.diff > worst.diff) worst = lapItem;
    });

    return { best: best.id, worst: worst.id };
  }, [laps]);

  const { best, worst } = getBestWorstLap();

  const renderLap = ({ item, index }) => {
    const lapNumber = laps.length - index;
    const isBest = item.id === best;
    const isWorst = item.id === worst;

    return (
      <View style={styles.lapItem}>
        <Text
          style={[
            styles.lapText,
            isBest && styles.bestLap,
            isWorst && styles.worstLap,
          ]}
        >
          ラップ {lapNumber}
        </Text>
        <Text
          style={[
            styles.lapTime,
            isBest && styles.bestLap,
            isWorst && styles.worstLap,
          ]}
        >
          {formatTime(item.diff)}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.timerContainer}>
        <Text style={styles.timerText}>{formatTime(time)}</Text>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={isRunning ? lap : reset}
        >
          <Text style={styles.secondaryButtonText}>
            {isRunning ? 'ラップ' : 'リセット'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.button,
            isRunning ? styles.stopButton : styles.startButton,
          ]}
          onPress={isRunning ? stop : start}
        >
          <Text
            style={[
              styles.buttonText,
              isRunning ? styles.stopButtonText : styles.startButtonText,
            ]}
          >
            {isRunning ? 'ストップ' : 'スタート'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.lapsContainer}>
        {laps.length > 0 && (
          <FlatList
            data={laps}
            renderItem={renderLap}
            keyExtractor={(item) => item.id.toString()}
            style={styles.lapsList}
          />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    paddingHorizontal: 20,
  },
  timerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  timerText: {
    fontSize: 72,
    fontWeight: '200',
    color: '#fff',
    fontVariant: ['tabular-nums'],
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 20,
  },
  button: {
    width: 90,
    height: 90,
    borderRadius: 45,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryButton: {
    backgroundColor: '#333',
  },
  startButton: {
    backgroundColor: '#0a3d0a',
    borderWidth: 2,
    borderColor: '#4CD964',
  },
  stopButton: {
    backgroundColor: '#3d0a0a',
    borderWidth: 2,
    borderColor: '#FF3B30',
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '600',
  },
  secondaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  startButtonText: {
    color: '#4CD964',
  },
  stopButtonText: {
    color: '#FF3B30',
  },
  lapsContainer: {
    flex: 1,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  lapsList: {
    flex: 1,
  },
  lapItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  lapText: {
    fontSize: 16,
    color: '#fff',
  },
  lapTime: {
    fontSize: 16,
    color: '#fff',
    fontVariant: ['tabular-nums'],
  },
  bestLap: {
    color: '#4CD964',
  },
  worstLap: {
    color: '#FF3B30',
  },
});

export default Stopwatch;
