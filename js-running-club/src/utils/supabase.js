import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ihwzflblfeayyjuaizrx.supabase.co';
const supabaseKey = 'sb_publishable_jRv8RmKitJkUsSRTmLto9A_nJtuQTI-';

export const supabase = createClient(supabaseUrl, supabaseKey);