import { READY_DOCK_POSTER_DATA } from "@/lib/ready/poster-data";
import styles from "./ReadyAssistant.module.css";

export default function ReadyPoster({ floating = false }: { floating?: boolean }) {
  // Inline the transparent render so the first header paint needs no image request.
  // eslint-disable-next-line @next/next/no-img-element
  return <img alt="" className={floating ? styles.artPoster : styles.poster} data-ready-poster=""
    decoding="sync" height={224} src={READY_DOCK_POSTER_DATA} width={224} />;
}
