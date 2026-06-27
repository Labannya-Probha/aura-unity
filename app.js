const SUPABASE_URL = "https://ltcjgbhjkfvlzzvvulhz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0Y2pnYmhqa2Z2bHp6dnZ1bGh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1NDM2MjYsImV4cCI6MjA5ODExOTYyNn0.nfSI1_x4LSg9xNGQJSeflU8_zWSnpwRmzRBG0_YldUc"; // rotate key and paste new key

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const loginForm = document.getElementById("loginForm");
const signupBtn = document.getElementById("signupBtn");
const statusEl = document.getElementById("status");

function setStatus(message, type = "muted") {
  statusEl.className = type;
  statusEl.textContent = message;
}

async function ensureProfile(user) {
  const { error } = await supabaseClient
    .from("profiles")
    .upsert(
      {
        id: user.id, // uuid from auth.users
        full_name: user.user_metadata?.full_name ?? null
      },
      { onConflict: "id" }
    );

  if (error) throw error;
}

async function redirectIfLoggedIn() {
  const { data: { session }, error } = await supabaseClient.auth.getSession();
  if (error) {
    console.error(error);
    return;
  }
  if (session?.user) {
    window.location.href = "./dashboard.html";
  }
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  setStatus("Logging in...");

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    setStatus(error.message, "error");
    return;
  }

  try {
    await ensureProfile(data.user);
    setStatus("Login successful. Redirecting...", "ok");
    window.location.href = "./dashboard.html";
  } catch (err) {
    console.error(err);
    setStatus("Login ok, but profile access failed (check RLS/policies).", "error");
  }
});

signupBtn.addEventListener("click", async () => {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  if (!email || !password) {
    setStatus("Email/password dao first.", "error");
    return;
  }

  setStatus("Creating account...");

  const { data, error } = await supabaseClient.auth.signUp({ email, password });

  if (error) {
    setStatus(error.message, "error");
    return;
  }

  if (data.user) {
    setStatus("Account created. If email confirmation is enabled, verify email first.", "ok");
  } else {
    setStatus("Signup complete. Check your email for confirmation.", "ok");
  }
});

redirectIfLoggedIn();
