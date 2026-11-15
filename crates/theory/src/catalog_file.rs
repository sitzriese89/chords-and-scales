//! What scale files and chord files share: the TOML list-of-tables layout, per-item errors,
//! and the id rule (ADR-20, ADR-27).

use std::collections::HashMap;
use std::fmt;

/// Why an item of a catalog file (a scale or a chord), or the file as a whole, was not loaded.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CatalogError {
    /// The index (0-based) of the `[[scale]]` or `[[chord]]` item, or `None` for the file as a
    /// whole.
    pub item: Option<usize>,
    /// The item's `id`, if it has a string one.
    pub id: Option<String>,
    /// What is wrong, in plain English.
    pub message: String,
    /// `scale` or `chord`: what the items are called.
    table: &'static str,
}

impl fmt::Display for CatalogError {
    /// `scale 3 ("my-scale"): …`, numbered from 1 as in the file.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let table = self.table;
        match (self.item, &self.id) {
            (Some(item), Some(id)) => write!(f, "{table} {} ({id:?}): {}", item + 1, self.message),
            (Some(item), None) => write!(f, "{table} {}: {}", item + 1, self.message),
            (None, _) => f.write_str(&self.message),
        }
    }
}

impl std::error::Error for CatalogError {}

/// Reads a file of `[[table]]` tables item by item. `build` makes one item from its table or
/// says what is wrong; `id_of` is the item's id, which must be unique in the file (the first
/// item with an id wins). Never fails as a whole: a file that is not TOML, or has keys other
/// than `table`, gives errors without an item and the valid items still load.
pub(crate) fn parse_items<T>(
    toml: &str,
    table: &'static str,
    build: impl Fn(toml::Value) -> Result<T, String>,
    id_of: impl Fn(&T) -> &str,
) -> (Vec<T>, Vec<CatalogError>) {
    let mut parsed = Vec::new();
    let mut errors = Vec::new();
    let document_error = |message: String| CatalogError {
        item: None,
        id: None,
        message,
        table,
    };

    let root = match toml.parse::<toml::Table>() {
        Ok(root) => root,
        Err(error) => {
            let line = error
                .span()
                .map(|span| toml[..span.start].matches('\n').count() + 1);
            let message = match line {
                Some(line) => format!("not valid TOML (line {line}): {}", error.message()),
                None => format!("not valid TOML: {}", error.message()),
            };
            errors.push(document_error(message));
            return (parsed, errors);
        }
    };

    for key in root.keys().filter(|key| *key != table) {
        errors.push(document_error(format!(
            "unknown key {key:?} (a {table} file holds only [[{table}]] tables)"
        )));
    }

    let items = match root.get(table) {
        None => return (parsed, errors),
        Some(toml::Value::Array(items)) => items,
        Some(_) => {
            errors.push(document_error(format!(
                "\"{table}\" must be a list of [[{table}]] tables"
            )));
            return (parsed, errors);
        }
    };

    let mut seen: HashMap<String, usize> = HashMap::new();
    for (index, item) in items.iter().enumerate() {
        let id = item
            .get("id")
            .and_then(toml::Value::as_str)
            .map(str::to_owned);
        let error = |message: String| CatalogError {
            item: Some(index),
            id: id.clone(),
            message,
            table,
        };
        match build(item.clone()) {
            Ok(built) => {
                if let Some(first) = seen.get(id_of(&built)) {
                    errors.push(error(format!(
                        "duplicate id, already used by {table} {}",
                        first + 1
                    )));
                } else {
                    seen.insert(id_of(&built).to_owned(), index);
                    parsed.push(built);
                }
            }
            Err(message) => errors.push(error(message)),
        }
    }
    (parsed, errors)
}

/// `major`, `dorian-sharp-4`: lowercase ASCII letters and digits in words joined by `-`.
pub(crate) fn is_kebab_case(id: &str) -> bool {
    !id.is_empty()
        && id.split('-').all(|word| {
            !word.is_empty()
                && word
                    .bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
        })
}
