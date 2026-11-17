//! Todo logic, exposed to JavaScript as the `NativeTodoStore` TurboModule.
//!
//! All state lives here; the React side only renders what `getState` returns.
//! Todos are saved as JSON to `todos.json` in the app's data directory after
//! every change and loaded at startup.

use std::path::PathBuf;
use std::sync::Mutex;

use rn_gpui_module::ModuleError;
use serde::{Deserialize, Serialize};

use crate::{Filter, NativeTodoStoreEvents, NativeTodoStoreSpec, Todo, TodoState};

#[derive(Clone, Serialize, Deserialize)]
struct Item {
    id: u32,
    title: String,
    done: bool,
}

#[derive(Default, Serialize, Deserialize)]
struct Data {
    next_id: u32,
    items: Vec<Item>,
}

impl Data {
    fn add(&mut self, title: &str) -> bool {
        let title = title.trim();
        if title.is_empty() {
            return false;
        }
        self.next_id += 1;
        self.items.push(Item {
            id: self.next_id,
            title: title.to_string(),
            done: false,
        });
        true
    }

    fn toggle(&mut self, id: u32) -> bool {
        match self.items.iter_mut().find(|item| item.id == id) {
            Some(item) => {
                item.done = !item.done;
                true
            }
            None => false,
        }
    }

    fn remove(&mut self, id: u32) -> bool {
        let before = self.items.len();
        self.items.retain(|item| item.id != id);
        self.items.len() != before
    }

    fn clear_done(&mut self) -> usize {
        let before = self.items.len();
        self.items.retain(|item| !item.done);
        before - self.items.len()
    }

    fn matching<'a>(&'a self, filter: &'a Filter) -> impl Iterator<Item = &'a Item> + 'a {
        self.items.iter().filter(move |item| match filter {
            Filter::All => true,
            Filter::Active => !item.done,
            Filter::Done => item.done,
        })
    }

    fn remaining(&self) -> usize {
        self.items.iter().filter(|item| !item.done).count()
    }
}

pub struct TodoStore {
    data: Mutex<Data>,
    path: Option<PathBuf>,
}

impl TodoStore {
    fn storage_path() -> Option<PathBuf> {
        let home = std::env::var_os("HOME").map(PathBuf::from)?;
        let dir = if cfg!(target_os = "macos") {
            home.join("Library/Application Support")
        } else {
            std::env::var_os("XDG_DATA_HOME")
                .map(PathBuf::from)
                .unwrap_or_else(|| home.join(".local/share"))
        };
        Some(dir.join("react-native-gpui-todo").join("todos.json"))
    }

    fn load(path: &Option<PathBuf>) -> Data {
        path.as_ref()
            .and_then(|path| std::fs::read(path).ok())
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default()
    }

    /// Runs `change` on the data and saves it when `change` reports a change.
    fn mutate<T>(&self, change: impl FnOnce(&mut Data) -> T, changed: impl Fn(&T) -> bool) -> T {
        let mut data = self.data.lock().unwrap_or_else(|poison| poison.into_inner());
        let result = change(&mut data);
        if changed(&result) {
            self.save(&data);
        }
        result
    }

    fn save(&self, data: &Data) {
        let Some(path) = &self.path else { return };
        if let Some(dir) = path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        match serde_json::to_vec_pretty(data) {
            Ok(bytes) => {
                if let Err(error) = std::fs::write(path, bytes) {
                    eprintln!("todo store: could not write {}: {error}", path.display());
                }
            }
            Err(error) => eprintln!("todo store: could not serialize: {error}"),
        }
    }
}

impl NativeTodoStoreSpec for TodoStore {
    fn new(_events: NativeTodoStoreEvents) -> Self {
        let path = Self::storage_path();
        let data = Self::load(&path);
        Self {
            data: Mutex::new(data),
            path,
        }
    }

    fn get_state(&self, filter: Filter) -> Result<TodoState, ModuleError> {
        let data = self.data.lock().unwrap_or_else(|poison| poison.into_inner());
        Ok(TodoState {
            items: data
                .matching(&filter)
                .map(|item| Todo {
                    id: item.id as f64,
                    title: item.title.clone(),
                    done: item.done,
                })
                .collect(),
            remaining: data.remaining() as f64,
            total: data.items.len() as f64,
        })
    }

    fn add(&self, title: String) -> Result<bool, ModuleError> {
        Ok(self.mutate(|data| data.add(&title), |added| *added))
    }

    fn toggle(&self, id: f64) -> Result<bool, ModuleError> {
        Ok(self.mutate(|data| data.toggle(id as u32), |found| *found))
    }

    fn remove(&self, id: f64) -> Result<bool, ModuleError> {
        Ok(self.mutate(|data| data.remove(id as u32), |found| *found))
    }

    fn clear_done(&self) -> Result<f64, ModuleError> {
        Ok(self.mutate(|data| data.clear_done(), |removed| *removed > 0) as f64)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn add_rejects_blank_and_trims() {
        let mut data = Data::default();
        assert!(!data.add("   "));
        assert!(data.add("  buy milk  "));
        assert_eq!(data.items[0].title, "buy milk");
        assert_eq!(data.items[0].id, 1);
    }

    #[test]
    fn toggle_remove_and_clear() {
        let mut data = Data::default();
        data.add("a");
        data.add("b");
        data.add("c");
        assert!(data.toggle(1));
        assert!(!data.toggle(99));
        assert_eq!(data.remaining(), 2);
        assert_eq!(data.matching(&Filter::Done).count(), 1);
        assert_eq!(data.matching(&Filter::Active).count(), 2);
        assert!(data.remove(2));
        assert!(!data.remove(2));
        assert_eq!(data.clear_done(), 1);
        assert_eq!(data.items.len(), 1);
        assert_eq!(data.items[0].title, "c");
    }

    #[test]
    fn ids_are_not_reused_after_delete() {
        let mut data = Data::default();
        data.add("a");
        data.remove(1);
        data.add("b");
        assert_eq!(data.items[0].id, 2);
    }
}
