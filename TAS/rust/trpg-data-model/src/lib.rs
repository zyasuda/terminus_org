//! TAS、mock2、Bevyゲームで共有するキャンペーンデータモデル。
//!
//! 未知のJSON項目は無視し、拡張項目は保存できるようにしている。
//! そのため、TASの追加項目でゲーム側が壊れず、参照整合性だけを共通検証できる。

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
use std::fmt;

pub type JsonMap = BTreeMap<String, Value>;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CampaignDocument {
    #[serde(default)]
    pub meta: CampaignMeta,
    #[serde(default)]
    pub style: CampaignStyle,
    #[serde(default)]
    pub flags: JsonMap,
    #[serde(default)]
    pub cast: Vec<CastMember>,
    #[serde(default)]
    pub companions: Vec<Companion>,
    #[serde(default)]
    pub entities: Vec<Entity>,
    #[serde(default)]
    pub items: Vec<Item>,
    #[serde(default, rename = "initialInventory")]
    pub initial_inventory: Vec<String>,
    #[serde(default, rename = "initialInventoryIds")]
    pub initial_inventory_ids: Vec<String>,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CampaignMeta {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub version: String,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CampaignStyle {
    #[serde(default)]
    pub narration: String,
    #[serde(default, rename = "readingLevel")]
    pub reading_level: String,
    #[serde(default, rename = "goodExample")]
    pub good_example: String,
    #[serde(default, rename = "badExample")]
    pub bad_example: String,
    #[serde(default)]
    pub extra: Vec<String>,
    #[serde(default, rename = "forbiddenWords")]
    pub forbidden_words: Vec<String>,
    #[serde(default)]
    pub world: String,
    #[serde(default, rename = "gameOverText")]
    pub game_over_text: String,
    #[serde(flatten)]
    pub unknown: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CastMember {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default, rename = "nameEn")]
    pub name_en: String,
    #[serde(default)]
    pub public: String,
    #[serde(default)]
    pub direction: String,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Companion {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub persona: String,
    #[serde(default)]
    pub gender: String,
    #[serde(default, rename = "firstPerson")]
    pub first_person: String,
    #[serde(default, rename = "addressTerm")]
    pub address_term: String,
    #[serde(default)]
    pub sprite: String,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Entity {
    #[serde(default)]
    pub id: String,
    #[serde(default, rename = "ja")]
    pub name: String,
    #[serde(default)]
    pub aliases: Vec<String>,
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub importance: String,
    #[serde(default)]
    pub surface: Option<String>,
    #[serde(default)]
    pub truth: Option<String>,
    #[serde(default)]
    pub visual: Option<String>,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Item {
    #[serde(default)]
    pub id: String,
    #[serde(default, rename = "ja")]
    pub name: String,
    #[serde(default)]
    pub aliases: Vec<String>,
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub scope: String,
    #[serde(default)]
    pub acquisition: String,
    #[serde(default)]
    pub persistent: bool,
    #[serde(default)]
    pub capabilities: Vec<String>,
    #[serde(default)]
    pub requires: String,
    #[serde(default)]
    pub visual: String,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ChapterDocument {
    #[serde(default)]
    pub id: u32,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub quest: String,
    #[serde(default)]
    pub intro: String,
    #[serde(default)]
    pub scenes: Vec<Scene>,
    #[serde(default, rename = "flagsOut")]
    pub flags_out: Vec<String>,
    #[serde(default, rename = "flagRules")]
    pub flag_rules: JsonMap,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Scene {
    #[serde(default)]
    pub id: u32,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub brief: String,
    #[serde(default)]
    pub goal: String,
    #[serde(default)]
    pub direction: String,
    #[serde(default)]
    pub img: String,
    #[serde(default)]
    pub parallax: Option<Parallax>,
    #[serde(default)]
    pub enemy: Option<Enemy>,
    #[serde(default)]
    pub secrets: Vec<Secret>,
    #[serde(default)]
    pub loot: Vec<Loot>,
    #[serde(default)]
    pub exits: Vec<Exit>,
    #[serde(default)]
    pub encounters: Vec<Encounter>,
    #[serde(default, rename = "completeRequires")]
    pub complete_requires: Option<Value>,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Parallax {
    #[serde(default)]
    pub sky: String,
    #[serde(default)]
    pub fg: String,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Enemy {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub hp: Option<i32>,
    #[serde(default, rename = "maxHp")]
    pub max_hp: Option<i32>,
    #[serde(default)]
    pub sprite: String,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Secret {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub entity: String,
    #[serde(default)]
    pub surface: String,
    #[serde(default, rename = "text")]
    pub fact: String,
    #[serde(default)]
    pub aliases: Vec<String>,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Loot {
    Name(String),
    Entry(LootEntry),
}

impl Default for Loot {
    fn default() -> Self {
        Self::Name(String::new())
    }
}
impl Loot {
    pub fn name(&self) -> &str {
        match self {
            Self::Name(name) => name,
            Self::Entry(entry) => &entry.name,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LootEntry {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub requires: String,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Exit {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub to: String,
    #[serde(default, rename = "match")]
    pub match_terms: Vec<String>,
    #[serde(default)]
    pub requires: Option<Value>,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Encounter {
    #[serde(default)]
    pub id: String,
    #[serde(default, rename = "type")]
    pub encounter_type: String,
    #[serde(default, rename = "monsterId")]
    pub monster_id: String,
    #[serde(default, rename = "monsterName")]
    pub monster_name: String,
    #[serde(default, rename = "triggerTerms")]
    pub trigger_terms: Vec<String>,
    #[serde(default, rename = "requiredElements")]
    pub required_elements: Vec<String>,
    #[serde(default, rename = "requiredOperator")]
    pub required_operator: String,
    #[serde(default)]
    pub probability: Option<u8>,
    #[serde(default)]
    pub timing: String,
    #[serde(default, rename = "maxOccurrences")]
    pub max_occurrences: Option<u32>,
    #[serde(default, rename = "blockedBy")]
    pub blocked_by: Vec<String>,
    #[serde(default, rename = "onsetText")]
    pub onset_text: String,
    #[serde(default)]
    pub notes: String,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Default)]
pub struct CampaignBundle {
    pub campaign: CampaignDocument,
    pub chapter: ChapterDocument,
}

impl CampaignBundle {
    pub fn from_files(
        campaign_path: impl AsRef<std::path::Path>,
        chapter_path: impl AsRef<std::path::Path>,
    ) -> Result<Self, DataError> {
        let campaign_json = std::fs::read_to_string(campaign_path).map_err(DataError::Io)?;
        let chapter_json = std::fs::read_to_string(chapter_path).map_err(DataError::Io)?;
        Self::from_json(&campaign_json, &chapter_json)
    }

    pub fn from_json(campaign_json: &str, chapter_json: &str) -> Result<Self, DataError> {
        Ok(Self {
            campaign: serde_json::from_str(campaign_json).map_err(DataError::Json)?,
            chapter: serde_json::from_str(chapter_json).map_err(DataError::Json)?,
        })
    }

    pub fn validate(&self) -> Vec<ValidationIssue> {
        let mut issues = Vec::new();
        let entity_names: BTreeSet<&str> = self
            .campaign
            .entities
            .iter()
            .map(|e| e.name.as_str())
            .filter(|n| !n.is_empty())
            .collect();
        let mut scene_ids = BTreeSet::new();
        let mut secret_ids = BTreeSet::new();
        for scene in &self.chapter.scenes {
            if !scene_ids.insert(scene.id) {
                issues.push(ValidationIssue::new(format!(
                    "scene id {} が重複しています",
                    scene.id
                )));
            }
            for secret in &scene.secrets {
                if !secret_ids.insert(secret.id.as_str()) {
                    issues.push(ValidationIssue::new(format!(
                        "secret id {} が重複しています",
                        secret.id
                    )));
                }
            }
            if let Some(enemy) = &scene.enemy {
                if !enemy.name.is_empty() && !entity_names.contains(enemy.name.as_str()) {
                    issues.push(ValidationIssue::new(format!(
                        "scene {} の敵 {} がentitiesにありません",
                        scene.id, enemy.name
                    )));
                }
            }
            for loot in &scene.loot {
                let name = loot.name();
                if !name.is_empty()
                    && !entity_names
                        .iter()
                        .any(|entity| name.starts_with(entity) || entity.starts_with(name))
                {
                    issues.push(ValidationIssue::new(format!(
                        "scene {} のloot {} がentitiesにありません",
                        scene.id, name
                    )));
                }
            }
        }
        for flag in &self.chapter.flags_out {
            if !self.campaign.flags.contains_key(flag) {
                issues.push(ValidationIssue::new(format!(
                    "flagsOut {} がcampaign.flagsにありません",
                    flag
                )));
            }
        }
        issues
    }
}

#[derive(Debug)]
pub enum DataError {
    Io(std::io::Error),
    Json(serde_json::Error),
}
impl fmt::Display for DataError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => write!(f, "JSONファイルの読み込みに失敗しました: {error}"),
            Self::Json(error) => write!(f, "JSONの読み込みに失敗しました: {error}"),
        }
    }
}
impl std::error::Error for DataError {}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidationIssue {
    pub message: String,
}
impl ValidationIssue {
    fn new(message: String) -> Self {
        Self { message }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn current_tas_fixtures_are_readable_and_valid() {
        let bundle = CampaignBundle::from_json(
            include_str!("../../../data/campaign.json"),
            include_str!("../../../data/chapter_01.json"),
        )
        .expect("TASのJSONを読み込めること");
        assert_eq!(bundle.campaign.meta.id, "lanternhill");
        assert_eq!(bundle.chapter.scenes.len(), 5);
        assert!(
            bundle.validate().is_empty(),
            "検証エラー: {:?}",
            bundle.validate()
        );
    }

    #[test]
    fn accepts_optional_exit_and_loot_shapes() {
        let bundle = CampaignBundle::from_json(
            r#"{"entities":[{"ja":"ランタン"}],"flags":{"done":[true,false]}}"#,
            r#"{"id":1,"flagsOut":["done"],"scenes":[{"id":1,"name":"開始","loot":["ランタン",{"name":"ランタン","requires":"s1"}],"exits":[{"id":"to_next","to":"scene:2","match":["進む"]}]}]}"#,
        ).unwrap();
        assert_eq!(bundle.chapter.scenes[0].loot[1].name(), "ランタン");
        assert_eq!(bundle.chapter.scenes[0].exits[0].match_terms, vec!["進む"]);
        assert!(bundle.validate().is_empty());
    }

    #[test]
    fn reports_missing_entity_and_flag() {
        let bundle = CampaignBundle::from_json(
            r#"{"entities":[]}"#,
            r#"{"flagsOut":["missing"],"scenes":[{"id":1,"enemy":{"name":"敵"}}]}"#,
        )
        .unwrap();
        assert_eq!(bundle.validate().len(), 2);
    }
}
