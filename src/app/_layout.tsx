import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/* ---------- Types ---------- */
type Priority = 'Low' | 'Medium' | 'High';
type Task = {
  id: string;
  title: string;
  category: string;
  priority: Priority;
  completed: boolean;
  createdAt: number;
};
type Filter = 'All' | 'Active' | 'Completed';
type IconName = React.ComponentProps<typeof Ionicons>['name'];

/* ---------- Theme (soft peach + cream, dark dock) ---------- */
const C = {
  bg: '#F6F3EE',
  card: '#FFFFFF',
  peach: '#FFA070',
  peachSoft: '#FFE3D3',
  peachDeep: '#F58A55',
  sand: '#EAE6DD',
  dark: '#2A2A2A',
  text: '#2B2B2B',
  muted: '#9A958E',
  border: '#EFEAE2',
  mint: '#BFE3C8',
  mintDeep: '#5BB37A',
  butter: '#FFE9A8',
  butterDeep: '#E2B33B',
  rose: '#FFC9CF',
  roseDeep: '#E96F7E',
  lilac: '#DDD6FF',
};

const STORAGE_KEY = '@peach_todo_tasks_v1';

const CATEGORIES: { name: string; icon: IconName; tint: string; color: string }[] = [
  { name: 'All', icon: 'apps', tint: C.peachSoft, color: C.peachDeep },
  { name: 'Personal', icon: 'heart', tint: C.rose, color: C.roseDeep },
  { name: 'Work', icon: 'briefcase', tint: C.butter, color: C.butterDeep },
  { name: 'Study', icon: 'book', tint: C.mint, color: C.mintDeep },
  { name: 'Other', icon: 'sparkles', tint: C.lilac, color: '#7C6FE0' },
];
const TASK_CATEGORIES = CATEGORIES.filter(c => c.name !== 'All');
const catOf = (name: string) =>
  CATEGORIES.find(c => c.name === name) || CATEGORIES[4];

const PRIORITY_LEVEL: Record<Priority, number> = { Low: 1, Medium: 2, High: 3 };
const PRIORITY_COLOR: Record<Priority, string> = {
  Low: C.mintDeep,
  Medium: C.butterDeep,
  High: C.roseDeep,
};

/* ---------- Sample data (shown on first launch) ---------- */
const makeSampleTasks = (): Task[] => {
  const now = Date.now();
  const rows: [string, string, Priority, boolean][] = [
    ['Finish thesis chapter 3 draft', 'Study', 'High', false],
    ['Prepare slides for Friday workshop', 'Work', 'High', false],
    ['Reply to advisor email', 'Work', 'Medium', false],
    ['Read 20 pages of data structures', 'Study', 'Medium', false],
    ['Buy groceries for the week', 'Personal', 'Medium', false],
    ['Workout for 30 minutes', 'Personal', 'Low', false],
    ['Call mom', 'Personal', 'Low', false],
    ['Organize desktop files', 'Other', 'Low', false],
    ['Submit lesson plan', 'Work', 'High', true],
    ['Water the plants', 'Personal', 'Low', true],
  ];
  return rows.map(([title, category, priority, completed], i) => ({
    id: `sample-${i}`,
    title,
    category,
    priority,
    completed,
    createdAt: now - i * 60000,
  }));
};

/* ---------- Arc gauge (segments like the reference) ---------- */
const SEGMENTS = 11;
const ARC_W = 300;
const ARC_H = 190;
const ARC_R = 118;
const SEG_W = 38;
const SEG_H = 34;

function ArcGauge({
  progress,
  label,
  sub,
  caption,
}: {
  progress: number;
  label: string;
  sub: string;
  caption: string;
}) {
  const filled = Math.round((progress / 100) * SEGMENTS);
  const cx = ARC_W / 2;
  const cy = ARC_R + 26;
  const items = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const t = 200 - (i * 220) / (SEGMENTS - 1); // degrees, 200 -> -20
    const rad = (t * Math.PI) / 180;
    const x = cx + ARC_R * Math.cos(rad) - SEG_W / 2;
    const y = cy - ARC_R * Math.sin(rad) - SEG_H / 2;
    items.push(
      <View
        key={i}
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width: SEG_W,
          height: SEG_H,
          borderRadius: 13,
          backgroundColor: i < filled ? C.peach : C.sand,
          transform: [{ rotate: `${90 - t}deg` }],
        }}
      />,
    );
  }
  return (
    <View style={{ width: ARC_W, height: ARC_H, alignSelf: 'center' }}>
      {items}
      <View style={styles.gaugeCenter}>
        <Ionicons name="flash" size={22} color={C.peach} style={{ marginBottom: 2 }} />
        <Text style={styles.gaugeSub}>{sub}</Text>
        <Text style={styles.gaugeBig}>{label}</Text>
        <Text style={styles.gaugeGoal}>{caption}</Text>
      </View>
    </View>
  );
}

/* ---------- Screen ---------- */
export default function HomeScreen() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [filter, setFilter] = useState<Filter>('All');
  const [catFilter, setCatFilter] = useState('All');
  const [search, setSearch] = useState('');

  const [modalVisible, setModalVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Personal');
  const [priority, setPriority] = useState<Priority>('Medium');

  /* load */
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved) setTasks(JSON.parse(saved));
        else setTasks(makeSampleTasks()); // first launch only
      } catch (e) {
        console.log('Loading error:', e);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  /* save */
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)).catch(e =>
      console.log('Saving error:', e),
    );
  }, [tasks, loaded]);

  const animate = () =>
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

  const completedCount = tasks.filter(t => t.completed).length;
  const activeCount = tasks.length - completedCount;
  const progress = tasks.length
    ? Math.round((completedCount / tasks.length) * 100)
    : 0;

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks
      .filter(t => {
        const f =
          filter === 'All' ||
          (filter === 'Active' && !t.completed) ||
          (filter === 'Completed' && t.completed);
        const c = catFilter === 'All' || t.category === catFilter;
        return f && c && t.title.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        if (a.completed !== b.completed) return Number(a.completed) - Number(b.completed);
        if (!a.completed && PRIORITY_LEVEL[a.priority] !== PRIORITY_LEVEL[b.priority])
          return PRIORITY_LEVEL[b.priority] - PRIORITY_LEVEL[a.priority];
        return b.createdAt - a.createdAt;
      });
  }, [tasks, filter, catFilter, search]);

  const catCount = (name: string) =>
    name === 'All' ? tasks.length : tasks.filter(t => t.category === name).length;

  /* actions */
  const openAdd = () => {
    setEditingTask(null);
    setTitle('');
    setCategory(catFilter !== 'All' ? catFilter : 'Personal');
    setPriority('Medium');
    setModalVisible(true);
  };
  const openEdit = (t: Task) => {
    setEditingTask(t);
    setTitle(t.title);
    setCategory(t.category);
    setPriority(t.priority);
    setModalVisible(true);
  };
  const saveTask = () => {
    const clean = title.trim();
    if (!clean) {
      Alert.alert('Missing task', 'Please enter a task name.');
      return;
    }
    animate();
    if (editingTask) {
      setTasks(prev =>
        prev.map(t =>
          t.id === editingTask.id ? { ...t, title: clean, category, priority } : t,
        ),
      );
    } else {
      setTasks(prev => [
        {
          id: Date.now().toString(),
          title: clean,
          category,
          priority,
          completed: false,
          createdAt: Date.now(),
        },
        ...prev,
      ]);
    }
    setModalVisible(false);
    setTitle('');
  };
  const toggleTask = (id: string) => {
    animate();
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, completed: !t.completed } : t)));
  };
  const deleteTask = (id: string) => {
    Alert.alert('Delete task', 'Are you sure you want to delete this task?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          animate();
          setTasks(prev => prev.filter(t => t.id !== id));
          setModalVisible(false);
        },
      },
    ]);
  };
  const clearCompleted = () => {
    if (!completedCount) return;
    Alert.alert('Clear completed', `Remove ${completedCount} completed task(s)?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          animate();
          setTasks(prev => prev.filter(t => !t.completed));
        },
      },
    ]);
  };

  const greeting = (): { text: string; icon: IconName } => {
    const h = new Date().getHours();
    if (h < 12) return { text: 'Good morning', icon: 'sunny' };
    if (h < 18) return { text: 'Good afternoon', icon: 'partly-sunny' };
    return { text: 'Good evening', icon: 'moon' };
  };
  const g = greeting();
  const dateText = new Date().toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  /* ---------- Render ---------- */
  const renderTask = (item: Task) => {
    const cat = catOf(item.category);
    return (
      <View key={item.id} style={[styles.taskCard, item.completed && { opacity: 0.7 }]}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => toggleTask(item.id)}
          style={[styles.checkbox, item.completed && styles.checkboxDone]}
        >
          {item.completed && <Ionicons name="checkmark" size={18} color="#fff" />}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.taskBody}
          activeOpacity={0.7}
          onPress={() => openEdit(item)}
        >
          <Text
            style={[styles.taskTitle, item.completed && styles.taskTitleDone]}
            numberOfLines={2}
          >
            {item.title}
          </Text>
          <View style={styles.metaRow}>
            <View style={[styles.catPill, { backgroundColor: cat.tint }]}>
              <Ionicons name={cat.icon} size={12} color={cat.color} />
              <Text style={styles.catPillText}>{item.category}</Text>
            </View>
            <View style={styles.bars}>
              {[1, 2, 3].map(n => (
                <View
                  key={n}
                  style={[
                    styles.bar,
                    {
                      backgroundColor:
                        n <= PRIORITY_LEVEL[item.priority]
                          ? PRIORITY_COLOR[item.priority]
                          : C.sand,
                    },
                  ]}
                />
              ))}
            </View>
            <Text style={styles.priorityLabel}>{item.priority}</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(item)}>
          <Ionicons name="create-outline" size={19} color={C.text} />
        </TouchableOpacity>
      </View>
    );
  };

  const dockItems: { f: Filter; icon: IconName; iconOff: IconName; label: string }[] = [
    { f: 'All', icon: 'home', iconOff: 'home-outline', label: 'All' },
    { f: 'Active', icon: 'time', iconOff: 'time-outline', label: 'Active' },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 140 }}
      >
        {/* Top bar */}
        <View style={styles.topBar}>
          <View style={styles.roundBtn}>
            <Ionicons name="calendar" size={21} color={C.text} />
          </View>
          <View style={{ alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Ionicons name={g.icon} size={14} color={C.peachDeep} />
              <Text style={styles.topGreeting}>{g.text}</Text>
            </View>
            <Text style={styles.topTitle}>My Tasks</Text>
          </View>
          <TouchableOpacity style={styles.roundBtn} onPress={clearCompleted}>
            <Ionicons name="notifications" size={21} color={C.text} />
            {completedCount > 0 && <View style={styles.notifDot} />}
          </TouchableOpacity>
        </View>

        {/* Gauge */}
        <View style={styles.gaugeWrap}>
          <ArcGauge
            progress={progress}
            sub={dateText}
            label={`${completedCount}/${tasks.length} done`}
            caption={
              tasks.length === 0
                ? 'Add your first task'
                : activeCount === 0
                ? 'All done — amazing!'
                : `${activeCount} to go · ${progress}%`
            }
          />
        </View>

        {/* Add bar */}
        <TouchableOpacity activeOpacity={0.8} style={styles.addStrip} onPress={openAdd}>
          <Ionicons name="add" size={26} color={C.text} />
          <Text style={styles.addStripText}>Add a new task</Text>
        </TouchableOpacity>

        <View style={styles.pad}>
          {/* Search */}
          <View style={styles.searchRow}>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={20} color={C.text} style={{ marginRight: 10 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search"
                placeholderTextColor={C.muted}
                value={search}
                onChangeText={setSearch}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')} hitSlop={10}>
                  <Ionicons name="close-circle" size={20} color={C.muted} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Category tiles */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingVertical: 6, paddingRight: 6, gap: 10 }}
          >
            {CATEGORIES.map(c => {
              const active = catFilter === c.name;
              return (
                <TouchableOpacity
                  key={c.name}
                  activeOpacity={0.8}
                  onPress={() => {
                    animate();
                    setCatFilter(c.name);
                  }}
                  style={{ alignItems: 'center' }}
                >
                  <View
                    style={[
                      styles.catTile,
                      { backgroundColor: active ? c.tint : C.card },
                      active && styles.catTileActive,
                    ]}
                  >
                    <Ionicons name={c.icon} size={28} color={active ? c.color : C.muted} />
                    <View style={styles.countBadge}>
                      <Text style={styles.countBadgeText}>{catCount(c.name)}</Text>
                    </View>
                  </View>
                  <Text style={[styles.catLabel, active && { color: C.text, fontWeight: '700' }]}>
                    {c.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Section header */}
          <View style={styles.sectionRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.sectionTitle}>Today's Tasks</Text>
              <View style={styles.sectionBadge}>
                <Text style={styles.sectionBadgeText}>{filteredTasks.length}</Text>
              </View>
            </View>
            <Text style={styles.seeAll}>{activeCount} remaining</Text>
          </View>

          {/* List */}
          {filteredTasks.length > 0 ? (
            filteredTasks.map(renderTask)
          ) : (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons
                  name={search ? 'search' : 'checkbox-outline'}
                  size={34}
                  color={C.peach}
                />
              </View>
              <Text style={styles.emptyTitle}>
                {search ? 'No matching tasks' : 'Nothing here yet'}
              </Text>
              <Text style={styles.emptySub}>
                {search ? 'Try another keyword.' : 'Tap + to add a task and get things done!'}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Dark dock */}
      <View style={styles.dock}>
        {dockItems.map(i => {
          const on = filter === i.f;
          return (
            <TouchableOpacity
              key={i.f}
              style={styles.dockItem}
              onPress={() => {
                animate();
                setFilter(i.f);
              }}
            >
              <Ionicons name={on ? i.icon : i.iconOff} size={24} color={on ? C.peach : '#B9B4AC'} />
              <Text style={[styles.dockLabel, on && { color: C.peach }]}>{i.label}</Text>
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity activeOpacity={0.85} style={styles.dockFab} onPress={openAdd}>
          <Ionicons name="add" size={34} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.dockItem}
          onPress={() => {
            animate();
            setFilter('Completed');
          }}
        >
          <Ionicons
            name={filter === 'Completed' ? 'checkmark-circle' : 'checkmark-circle-outline'}
            size={24}
            color={filter === 'Completed' ? C.peach : '#B9B4AC'}
          />
          <Text style={[styles.dockLabel, filter === 'Completed' && { color: C.peach }]}>Done</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.dockItem} onPress={clearCompleted}>
          <Ionicons name="trash-outline" size={24} color="#B9B4AC" />
          <Text style={styles.dockLabel}>Clear</Text>
        </TouchableOpacity>
      </View>

      {/* Add / Edit modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.overlay}
        >
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{editingTask ? 'Edit Task' : 'New Task'}</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={20} color={C.muted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>TASK NAME</Text>
            <TextInput
              style={styles.input}
              placeholder="What do you need to do?"
              placeholderTextColor={C.muted}
              value={title}
              onChangeText={setTitle}
              autoFocus
              maxLength={100}
              returnKeyType="done"
              onSubmitEditing={saveTask}
            />

            <Text style={styles.label}>CATEGORY</Text>
            <View style={styles.chipRow}>
              {TASK_CATEGORIES.map(c => {
                const on = category === c.name;
                return (
                  <TouchableOpacity
                    key={c.name}
                    onPress={() => setCategory(c.name)}
                    style={[styles.chip, on && { backgroundColor: c.tint, borderColor: C.peach }]}
                  >
                    <Ionicons name={c.icon} size={16} color={on ? c.color : C.muted} />
                    <Text style={[styles.chipText, on && { color: C.text }]}>{c.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.label}>PRIORITY</Text>
            <View style={styles.chipRow}>
              {(['Low', 'Medium', 'High'] as Priority[]).map(p => {
                const on = priority === p;
                return (
                  <TouchableOpacity
                    key={p}
                    onPress={() => setPriority(p)}
                    style={[styles.chip, on && { backgroundColor: C.peachSoft, borderColor: C.peach }]}
                  >
                    <Ionicons name="flag" size={15} color={PRIORITY_COLOR[p]} />
                    <Text style={[styles.chipText, on && { color: C.text }]}>{p}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity style={styles.saveBtn} activeOpacity={0.85} onPress={saveTask}>
              <Ionicons
                name={editingTask ? 'checkmark-circle' : 'add-circle'}
                size={20}
                color="#fff"
              />
              <Text style={styles.saveText}>{editingTask ? 'Save Changes' : 'Create Task'}</Text>
            </TouchableOpacity>

            {editingTask && (
              <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteTask(editingTask.id)}>
                <Ionicons name="trash" size={17} color="#B1414F" />
                <Text style={styles.deleteText}>Delete task</Text>
              </TouchableOpacity>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

/* ---------- Styles ---------- */
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  pad: { paddingHorizontal: 20 },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  roundBtn: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#B8A99A',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  notifDot: {
    position: 'absolute',
    top: 10,
    right: 11,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: C.peach,
    borderWidth: 1.5,
    borderColor: C.card,
  },
  topGreeting: { fontSize: 12, color: C.peachDeep, fontWeight: '700' },
  topTitle: { fontSize: 18, color: C.text, fontWeight: '800', marginTop: 2 },

  gaugeWrap: { marginTop: 6, marginBottom: 4 },
  gaugeCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 62,
    alignItems: 'center',
  },
  gaugeSub: { fontSize: 13, color: C.text },
  gaugeBig: { fontSize: 30, fontWeight: '800', color: C.text, marginTop: 4 },
  gaugeGoal: { fontSize: 13, color: C.peach, fontWeight: '700', marginTop: 4 },

  addStrip: {
    marginHorizontal: 20,
    marginTop: 4,
    marginBottom: 18,
    height: 54,
    borderRadius: 27,
    backgroundColor: C.sand,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  addStripText: { fontSize: 14, color: C.muted, fontWeight: '600' },

  searchRow: { marginBottom: 14 },
  searchBox: {
    height: 52,
    borderRadius: 18,
    backgroundColor: C.card,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    shadowColor: '#B8A99A',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  searchInput: { flex: 1, fontSize: 15, color: C.text },

  catTile: {
    width: 70,
    height: 70,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
    shadowColor: '#B8A99A',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  catTileActive: { borderColor: C.peach },
  countBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: C.peach,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  countBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  catLabel: { marginTop: 7, fontSize: 12, color: C.muted, fontWeight: '500' },

  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 22,
    marginBottom: 14,
  },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: C.text },
  sectionBadge: {
    marginLeft: 8,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: C.peach,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  sectionBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  seeAll: { fontSize: 13, color: C.muted },

  taskCard: {
    backgroundColor: C.card,
    borderRadius: 22,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#B8A99A',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#E3DDD3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxDone: { backgroundColor: C.peach, borderColor: C.peach },
  taskBody: { flex: 1, marginLeft: 14 },
  taskTitle: { fontSize: 16, fontWeight: '700', color: C.text },
  taskTitleDone: { textDecorationLine: 'line-through', color: C.muted },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 9, gap: 10 },
  catPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  catPillText: { fontSize: 11, color: C.text, fontWeight: '600' },
  bars: { flexDirection: 'row', gap: 3 },
  bar: { width: 9, height: 16, borderRadius: 4 },
  priorityLabel: { fontSize: 11, color: C.muted },
  editBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },

  empty: {
    backgroundColor: C.card,
    borderRadius: 26,
    alignItems: 'center',
    paddingVertical: 38,
    paddingHorizontal: 24,
  },
  emptyIcon: {
    width: 70,
    height: 70,
    borderRadius: 24,
    backgroundColor: C.peachSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: C.text, marginTop: 14 },
  emptySub: { fontSize: 13, color: C.muted, marginTop: 6, textAlign: 'center' },

  /* dock */
  dock: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14,
    height: 76,
    borderRadius: 34,
    backgroundColor: C.dark,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  dockItem: { alignItems: 'center', justifyContent: 'center', width: 54 },
  dockLabel: { fontSize: 10, color: '#B9B4AC', marginTop: 3, fontWeight: '600' },
  dockFab: {
    width: 66,
    height: 56,
    borderRadius: 22,
    backgroundColor: C.peach,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.peach,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },

  /* modal */
  overlay: { flex: 1, backgroundColor: 'rgba(42,36,30,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.bg,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 36 : 26,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#DDD6CB',
    alignSelf: 'center',
    marginBottom: 20,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  sheetTitle: { fontSize: 22, fontWeight: '800', color: C.text },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 13,
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.3,
    color: C.muted,
    marginTop: 18,
    marginBottom: 10,
  },
  input: {
    height: 54,
    borderRadius: 18,
    backgroundColor: C.card,
    paddingHorizontal: 16,
    fontSize: 15,
    color: C.text,
    borderWidth: 1,
    borderColor: C.border,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: C.card,
    borderWidth: 1.5,
    borderColor: C.border,
  },
  chipText: { fontSize: 13, color: C.muted, fontWeight: '700' },
  saveBtn: {
    height: 56,
    borderRadius: 28,
    backgroundColor: C.dark,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 28,
  },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  deleteBtn: {
    height: 50,
    borderRadius: 25,
    backgroundColor: C.rose,
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  deleteText: { color: '#B1414F', fontSize: 14, fontWeight: '700' },
});