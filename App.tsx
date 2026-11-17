/**
 * Todo app built with React Native GPUI (desktop).
 *
 * @format
 */

import { useCallback, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import TodoStore, { Filter } from './desktop/src/NativeTodoStore';

// All todo logic (validation, filtering, counts, persistence) lives in Rust:
// see desktop/src/todo_store.rs.
const FILTERS: Filter[] = [Filter.All, Filter.Active, Filter.Done];

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <TodoScreen />
    </SafeAreaProvider>
  );
}

function TodoScreen() {
  const insets = useSafeAreaInsets();
  const c = discord;

  const [text, setText] = useState('');
  // Bumped after each add: remounting the TextInput guarantees it is emptied
  // (a controlled value reset alone doesn't always clear the native input).
  const [inputKey, setInputKey] = useState(0);
  const inputRef = useRef<TextInput>(null);
  const [filter, setFilter] = useState<Filter>(Filter.All);
  const [state, setState] = useState(() => TodoStore.getState(Filter.All));

  const refresh = useCallback(
    (f: Filter = filter) => setState(TodoStore.getState(f)),
    [filter],
  );

  const addTodo = () => {
    if (TodoStore.add(text)) {
      inputRef.current?.clear();
      setText('');
      setInputKey(k => k + 1);
      refresh();
    }
  };
  const toggle = (id: number) => TodoStore.toggle(id) && refresh();
  const remove = (id: number) => TodoStore.remove(id) && refresh();
  const clearDone = () => TodoStore.clearDone() > 0 && refresh();
  const changeFilter = (f: Filter) => {
    setFilter(f);
    refresh(f);
  };

  const { items: visible, remaining, total } = state;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: c.bg, paddingTop: insets.top + 24 },
      ]}
    >
      <Text style={[styles.title, { color: c.text }]}>Todos</Text>

      <View style={styles.inputRow}>
        <TextInput
          key={inputKey}
          ref={inputRef}
          style={[
            styles.input,
            { color: c.text, borderColor: c.border, backgroundColor: c.input },
          ]}
          placeholder="What needs to be done?"
          placeholderTextColor={c.muted}
          value={text}
          onChangeText={setText}
          onSubmitEditing={addTodo}
          submitBehavior="submit"
          autoFocus
        />
        <Pressable
          onPress={addTodo}
          style={({ pressed }) => [
            styles.addButton,
            { backgroundColor: c.accent, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={styles.addButtonText}>Add</Text>
        </Pressable>
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map(f => (
          <Pressable
            key={f}
            onPress={() => changeFilter(f)}
            style={[
              styles.filterChip,
              {
                borderColor: filter === f ? c.accent : c.border,
                backgroundColor: filter === f ? c.accentSoft : 'transparent',
              },
            ]}
          >
            <Text style={{ color: filter === f ? c.accent : c.muted }}>
              {f[0].toUpperCase() + f.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView style={styles.list} contentContainerStyle={{ gap: 8 }}>
        {visible.length === 0 ? (
          <Text style={[styles.empty, { color: c.muted }]}>
            {total === 0 ? 'No todos yet — add one above.' : 'Nothing here.'}
          </Text>
        ) : (
          visible.map(todo => (
            <View
              key={todo.id}
              group="row"
              style={[
                styles.row,
                { backgroundColor: c.card, borderColor: c.border },
              ]}
              hoverStyle={{ borderColor: c.accent }}
            >
              <Pressable
                onPress={() => toggle(todo.id)}
                style={[
                  styles.checkbox,
                  {
                    borderColor: todo.done ? c.success : c.muted,
                    backgroundColor: todo.done ? c.success : 'transparent',
                  },
                ]}
              >
                {todo.done && <Text style={styles.check}>✓</Text>}
              </Pressable>
              <Pressable style={styles.rowTextWrap} onPress={() => toggle(todo.id)}>
                <Text
                  style={[
                    styles.rowText,
                    { color: todo.done ? c.muted : c.text },
                    todo.done && styles.rowTextDone,
                  ]}
                >
                  {todo.title}
                </Text>
              </Pressable>
              <View
                style={styles.deleteWrap}
                groupHoverStyle={{ group: 'row', style: { opacity: 1 } }}
                tooltip="Delete"
              >
                <Pressable onPress={() => remove(todo.id)} hitSlop={8}>
                  <Text style={{ color: c.danger, fontSize: 16 }}>✕</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: c.border }]}>
        <Text style={{ color: c.muted }}>
          {remaining} item{remaining === 1 ? '' : 's'} left
        </Text>
        <Pressable onPress={clearDone}>
          <Text style={{ color: c.muted }}>Clear completed</Text>
        </Pressable>
      </View>
    </View>
  );
}

// Discord-style palette (dark theme, "blurple" accent).
const discord = {
  bg: '#313338', // chat background
  card: '#2b2d31', // sidebar / cards
  input: '#383a40', // message box
  text: '#dbdee1',
  muted: '#949ba4',
  border: '#1e1f22',
  accent: '#5865f2', // blurple
  accentSoft: '#3c4270',
  success: '#23a55a', // online green
  danger: '#f23f43',
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24, paddingBottom: 16 },
  title: { fontSize: 32, fontWeight: '700', marginBottom: 16 },
  inputRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
  },
  addButton: {
    paddingHorizontal: 18,
    borderRadius: 8,
    justifyContent: 'center',
  },
  addButtonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  filterChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  list: { flex: 1 },
  empty: { textAlign: 'center', marginTop: 40 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 12,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: { color: '#fff', fontSize: 12, fontWeight: '700' },
  rowTextWrap: { flex: 1 },
  rowText: { fontSize: 15 },
  rowTextDone: { textDecorationLine: 'line-through' },
  deleteWrap: { opacity: 0 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    paddingTop: 12,
    marginTop: 12,
  },
});

export default App;
