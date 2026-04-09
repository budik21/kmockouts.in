/**
 * Renders a JSON-LD <script> tag for structured data.
 *
 * Use a single instance per document with an array of nodes when emitting
 * multiple types (e.g. SportsEvent + BreadcrumbList) so the payload stays
 * compact and the markup remains valid.
 */
interface JsonLdProps {
  data: object | object[];
}

export default function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      // Stringify here so React doesn't escape the quotes.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
