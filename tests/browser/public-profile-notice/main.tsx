import { createRoot } from "react-dom/client";
import PublicProfileNoticePage from "@/app/account/public-profile-notice/page";
import { getRequestLocale } from "./runtime";
import "./fixture.css";

const query = new URLSearchParams(window.location.search);
const host = document.getElementById("root")!;

async function renderNotice() {
  document.documentElement.lang = await getRequestLocale();
  const notice = await PublicProfileNoticePage({
    searchParams: Promise.resolve({ returnTo: "/admin?section=inbox", error: query.get("error") ?? undefined }),
  });
  createRoot(host).render(notice);
}

void renderNotice();
