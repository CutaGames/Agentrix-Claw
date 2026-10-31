//! L8 D3: a file-backed `SecureStore` for a node that runs without a desktop session (no OS keyring on a headless
//! Linux box). One 0600 file per entry in a 0700 directory, the same hex text the OS keyring store keeps, written
//! through a temporary file and a rename. A file that others can read, or that is not hex, is an error and is never
//! overwritten: replacing the device key would change the device id.
use crate::developer_runtime::home_node_identity::{RuntimeError, RuntimeResult, SecureStore};
use std::io::Write;
use std::path::PathBuf;

pub struct FileSecureStore {
    dir: PathBuf,
}

impl FileSecureStore {
    pub fn new(dir: PathBuf) -> Self {
        Self { dir }
    }

    fn path(&self, service: &str, key: &str) -> PathBuf {
        let clean = |text: &str| -> String { text.chars().map(|c| if c.is_ascii_alphanumeric() || c == '_' || c == '-' { c } else { '_' }).collect() };
        self.dir.join(format!("{}.{}.secret", clean(service), clean(key)))
    }

    fn read_text(&self, service: &str, key: &str) -> RuntimeResult<Option<String>> {
        let path = self.path(service, key);
        match std::fs::metadata(&path) {
            Ok(meta) => {
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    if meta.permissions().mode() & 0o077 != 0 {
                        return Err(RuntimeError::fail_closed("key_file_permissions"));
                    }
                }
                if !meta.is_file() || meta.len() > 8192 {
                    return Err(RuntimeError::fail_closed("key_file_corrupt"));
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(_) => return Err(RuntimeError::fail_closed("key_file_unreadable")),
        }
        let text = std::fs::read_to_string(&path).map_err(|_| RuntimeError::fail_closed("key_file_unreadable"))?;
        Ok(Some(text.trim().to_string()))
    }

    fn write_text(&self, service: &str, key: &str, text: &str) -> RuntimeResult<()> {
        std::fs::create_dir_all(&self.dir).map_err(|_| RuntimeError::fail_closed("key_file_write_failed"))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&self.dir, std::fs::Permissions::from_mode(0o700)).map_err(|_| RuntimeError::fail_closed("key_file_write_failed"))?;
        }
        let target = self.path(service, key);
        let temp = self.dir.join(format!(".{}.{}.tmp", std::process::id(), target.file_name().and_then(|n| n.to_str()).unwrap_or("secret")));
        let mut options = std::fs::OpenOptions::new();
        options.write(true).create(true).truncate(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temp).map_err(|_| RuntimeError::fail_closed("key_file_write_failed"))?;
        file.write_all(text.as_bytes()).and_then(|_| file.sync_all()).map_err(|_| RuntimeError::fail_closed("key_file_write_failed"))?;
        drop(file);
        std::fs::rename(&temp, &target).map_err(|_| RuntimeError::fail_closed("key_file_write_failed"))
    }
}

impl SecureStore for FileSecureStore {
    fn get(&self, service: &str, key: &str) -> RuntimeResult<Option<Vec<u8>>> {
        match self.read_text(service, key)? {
            None => Ok(None),
            Some(text) => hex::decode(text).map(Some).map_err(|_| RuntimeError::fail_closed("key_file_corrupt")),
        }
    }

    fn set(&self, service: &str, key: &str, value: &[u8]) -> RuntimeResult<()> {
        self.write_text(service, key, &hex::encode(value))
    }

    fn delete(&self, service: &str, key: &str) -> RuntimeResult<()> {
        match std::fs::remove_file(self.path(service, key)) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(_) => Err(RuntimeError::fail_closed("key_file_write_failed")),
        }
    }

    fn get_text(&self, service: &str, key: &str) -> RuntimeResult<Option<String>> {
        match self.read_text(service, key)? {
            Some(text) if text.is_empty() => Err(RuntimeError::fail_closed("key_file_corrupt")),
            other => Ok(other),
        }
    }

    fn set_text(&self, service: &str, key: &str, value: &str) -> RuntimeResult<()> {
        if value.is_empty() {
            return Err(RuntimeError::fail_closed("key_file_corrupt"));
        }
        self.write_text(service, key, value)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::developer_runtime::home_node_identity::DeviceIdentity;

    #[test]
    fn a_value_round_trips_and_the_file_is_private() {
        let dir = tempfile::tempdir().unwrap();
        let store = FileSecureStore::new(dir.path().join("node"));
        assert!(store.get("svc", "key").unwrap().is_none());
        store.set("svc", "key", &[1, 2, 3, 255]).unwrap();
        assert_eq!(store.get("svc", "key").unwrap(), Some(vec![1, 2, 3, 255]));
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let file = std::fs::read_dir(dir.path().join("node")).unwrap().next().unwrap().unwrap().path();
            assert_eq!(std::fs::metadata(&file).unwrap().permissions().mode() & 0o777, 0o600);
            assert_eq!(std::fs::metadata(dir.path().join("node")).unwrap().permissions().mode() & 0o777, 0o700);
        }
        store.delete("svc", "key").unwrap();
        assert!(store.get("svc", "key").unwrap().is_none());
        store.delete("svc", "key").unwrap();
    }

    #[test]
    fn entry_names_cannot_climb_out_of_the_directory() {
        let dir = tempfile::tempdir().unwrap();
        let store = FileSecureStore::new(dir.path().to_path_buf());
        store.set("../../etc", "passwd/..", &[9]).unwrap();
        let names: Vec<String> = std::fs::read_dir(dir.path()).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().to_string()).collect();
        assert_eq!(names.len(), 1);
        assert!(names[0].ends_with(".secret") && !names[0].contains('/'));
    }

    #[cfg(unix)]
    #[test]
    fn a_readable_or_broken_file_is_an_error_and_is_not_replaced() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let store = FileSecureStore::new(dir.path().to_path_buf());
        store.set("svc", "key", &[7, 7]).unwrap();
        let file = std::fs::read_dir(dir.path()).unwrap().next().unwrap().unwrap().path();
        std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o644)).unwrap();
        assert!(store.get("svc", "key").is_err());
        std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o600)).unwrap();
        std::fs::write(&file, "not hex!").unwrap();
        assert!(store.get("svc", "key").is_err());
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "not hex!");
    }

    #[test]
    fn the_receipt_signature_verifies_over_the_six_line_message_and_only_valid_fields_are_signed() {
        use base64::engine::general_purpose::URL_SAFE_NO_PAD;
        use base64::Engine as _;
        let dir = tempfile::tempdir().unwrap();
        let identity = DeviceIdentity::load_or_create(&FileSecureStore::new(dir.path().to_path_buf())).unwrap();
        let digest = crate::rental_jobs::result_digest("answer");
        let job = "hj_0123456789abcdef0123456789abcdef";
        let at = "2026-10-20T02:00:00.000Z";
        let signature = URL_SAFE_NO_PAD.decode(identity.sign_home_job_receipt(job, "completed", &digest, at).unwrap()).unwrap();
        assert_eq!(signature.len(), 64);
        let jwk = identity.public_jwk();
        let mut point = vec![4u8];
        point.extend(URL_SAFE_NO_PAD.decode(&jwk.x).unwrap());
        point.extend(URL_SAFE_NO_PAD.decode(&jwk.y).unwrap());
        let key = ring::signature::UnparsedPublicKey::new(&ring::signature::ECDSA_P256_SHA256_FIXED, point);
        let message = format!("agentrix.home.job.receipt.v1\n{}\n{job}\ncompleted\n{digest}\n{at}", identity.device_id());
        assert!(key.verify(message.as_bytes(), &signature).is_ok());
        assert!(key.verify(message.replace("completed", "failed").as_bytes(), &signature).is_err(), "the status is part of what is signed");
        // anything that is not exactly this form is not signed at all
        assert!(identity.sign_home_job_receipt(job, "pending", &digest, at).is_err());
        assert!(identity.sign_home_job_receipt("drj_0123456789abcdef0123456789abcdef", "completed", &digest, at).is_err());
        assert!(identity.sign_home_job_receipt("hj_0123", "completed", &digest, at).is_err());
        assert!(identity.sign_home_job_receipt(job, "completed", "sha256:abc", at).is_err());
        assert!(identity.sign_home_job_receipt(job, "completed", &digest, "yesterday").is_err());
        assert!(identity.sign_home_job_receipt(&format!("{job}\nextra"), "completed", &digest, at).is_err());
    }

    #[test]
    fn the_device_key_is_created_once_and_comes_back_the_same() {
        let dir = tempfile::tempdir().unwrap();
        let store = FileSecureStore::new(dir.path().to_path_buf());
        let first = DeviceIdentity::load_or_create(&store).map(|identity| identity.device_id().to_string()).unwrap_or_default();
        assert!(first.starts_with("dev_") && first.len() == 36);
        let second = DeviceIdentity::load_or_create(&store).map(|identity| identity.device_id().to_string()).unwrap_or_default();
        assert_eq!(first, second);
    }
}
