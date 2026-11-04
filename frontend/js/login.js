import { $, api } from "./common.js";

// ---------- Check existing session ----------
// If the user is already signed in, redirect to dashboard.
api("/auth/me")
  .then(() => {
    location.href = "index.html";
  })
  .catch(() => {
  });

// ---------- Handle login ----------
$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const error = $("#error");
  const submit = $("#submit");

  error.textContent = "";
  submit.disabled = true;
  submit.textContent = "Signing in...";

  try {
    await api("/auth/login", {
      method: "POST",
      body: {
        email: $("#email").value.trim(),
        password: $("#password").value
      }
    });

    location.href = "index.html";

  } catch (err) {
    error.textContent = err.message || "Unable to sign in. Please try again.";

    submit.disabled = false;
    submit.textContent = "Sign in";
  }
});