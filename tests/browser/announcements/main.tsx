import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import AdminAnnouncements from "@/components/AdminAnnouncements";
import AnnouncementsFeed from "@/components/AnnouncementsFeed";
import dictionary from "@/lib/i18n/dictionaries/en/public";
import { readFixtureAnnouncements, tournamentId } from "./runtime";
import "../../../app/globals.css";

function AnnouncementFixture() {
  const [announcements, setAnnouncements] = useState(readFixtureAnnouncements);
  const publicView = new URLSearchParams(location.search).get("surface") === "public";
  useEffect(() => {
    const refresh = () => setAnnouncements(readFixtureAnnouncements());
    window.addEventListener("announcement-fixture-refresh", refresh);
    return () => window.removeEventListener("announcement-fixture-refresh", refresh);
  }, []);
  return (
    <div className="min-h-screen bg-black text-white">
      <nav className="flex flex-wrap gap-6 border-b border-white/10 p-4 text-orange-300">
        <a href="/tests/browser/announcements/">Admin composer</a>
        <a href="/tests/browser/announcements/?surface=public">Public announcements</a>
      </nav>
      {publicView ? <main className="px-4 pb-16"><AnnouncementsFeed announcements={announcements.filter((announcement) => !announcement.withdrawnAt)} copy={dictionary.announcements} loadFailed={false} /></main> : <AdminAnnouncements announcements={announcements} loadFailed={false} tournamentOptions={[{ id: tournamentId, title: "Fixture Cup", status: "registration_open" }]} tournamentOptionsLoadFailed={false} />}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<AnnouncementFixture />);
