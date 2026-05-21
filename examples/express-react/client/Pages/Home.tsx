interface Props {
  greeting: string;
  now: number;
  auth: { user: { name: string } };
}

export default function Home({ greeting, now, auth }: Props) {
  return (
    <main>
      <h1>{greeting}</h1>
      <p>User: {auth.user.name}</p>
      <p>Now (lazy): {now}</p>
    </main>
  );
}
