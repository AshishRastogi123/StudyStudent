const { createClient } = require("@supabase/supabase-js");

const getSupabaseConfig = () => ({
  url: process.env.SUPABASE_URL || "",
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  bucket: process.env.SUPABASE_STORAGE_BUCKET || "studystudent-files",
});

const isSupabaseConfigured = () => {
  const { url, serviceRoleKey } = getSupabaseConfig();
  return Boolean(url && serviceRoleKey && url.startsWith("http"));
};

let client;

function getSupabaseClient() {
  if (!isSupabaseConfigured()) {
    return null;
  }

  if (!client) {
    const { url, serviceRoleKey } = getSupabaseConfig();
    client = createClient(url, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return client;
}

module.exports = {
  getSupabaseConfig,
  isSupabaseConfigured,
  getSupabaseClient,
};
