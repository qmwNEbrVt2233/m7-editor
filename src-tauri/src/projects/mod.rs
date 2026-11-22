pub(crate) mod commands;
pub(crate) mod store;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::media::MediaFile;

pub(crate) const PROJECT_CONFIG_FILE: &str = "project_config.json";

pub(crate) use store::project_summary;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectMediaConfig {
    pub(crate) name: Option<String>,
    pub(crate) use_external_link: bool,
    pub(crate) external_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectConfig {
    pub(crate) version: String,
    pub(crate) name: String,
    pub(crate) created_at: i64,
    pub(crate) last_change_at: i64,
    pub(crate) last_back_up_at: Option<i64>,
    pub(crate) project_file: String,
    pub(crate) media: Option<ProjectMediaConfig>,
    pub(crate) description: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectSummary {
    pub(crate) path: String,
    pub(crate) config: ProjectConfig,
    pub(crate) project_exists: bool,
    pub(crate) media_path: Option<String>,
    pub(crate) media_exists: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectPathCheck {
    pub(crate) path: String,
    pub(crate) exists: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CreateFolderProjectRequest {
    pub(crate) parent_dir: String,
    pub(crate) name: String,
    pub(crate) from_project: Option<Value>,
    #[serde(default)]
    pub(crate) from_project_path: Option<String>,
    pub(crate) media_path: Option<String>,
    pub(crate) copy_media: bool,
    pub(crate) description: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SaveFolderProjectRequest {
    pub(crate) project_path: String,
    pub(crate) project: Value,
    pub(crate) pending_media_path: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UpdateFolderProjectConfigRequest {
    pub(crate) project_path: String,
    pub(crate) config: ProjectConfig,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EditFolderProjectRequest {
    pub(crate) project_path: String,
    pub(crate) name: Option<String>,
    pub(crate) new_parent_dir: Option<String>,
    pub(crate) media_use_external_link: Option<bool>,
    pub(crate) media_external_path: Option<String>,
    pub(crate) description: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FolderProjectPayload {
    pub(crate) path: String,
    pub(crate) config: ProjectConfig,
    pub(crate) project: Value,
    pub(crate) media_file: Option<MediaFile>,
    pub(crate) warnings: Vec<String>,
}
