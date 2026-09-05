// A Movie's overview is its English Wikipedia lead, CC BY-SA 4.0 (ADR 0013), so
// every Movie surface credits the article. The Movie carries no article URL; its
// placeId is the Wikidata QID, and Wikidata redirects the QID to the article.
export default function WikipediaCredit({ placeId }: { placeId: string }) {
  return (
    <p className="mt-1 text-xs text-muted">
      Summary from{' '}
      <a
        href={`https://www.wikidata.org/wiki/Special:GoToLinkedPage/enwiki/${placeId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="underline"
      >
        Wikipedia
      </a>{' '}
      (CC BY-SA)
    </p>
  );
}
