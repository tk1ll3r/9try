/**
 * A person in a circle: their picture, or the first letter of their name when they have none. The
 * size and the colors of the letter come from `className`. Only a picture stored inside the profile
 * is drawn; an address on another server would tell that server who is looking.
 */
export function Avatar({ name, src, className = "" }: { name: string; src?: string | null; className?: string }) {
  return src?.startsWith("data:image/")
    ? <img src={src} alt="" className={`rounded-full object-cover ${className}`} />
    : <span className={`grid place-items-center rounded-full ${className}`}>{name.slice(0, 1).toUpperCase()}</span>;
}
