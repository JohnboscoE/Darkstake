import { Section, SectionHeading } from '@/components/site/section';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

const FAQS = [
  {
    q: 'If stakes are hidden, where does the price come from?',
    a: 'It does not. That is the trade. A conventional prediction market turns stake-weighted flow into a running probability; hide the weights and that number cannot exist. What Darkstake publishes instead is direction and participation — which side, and how many positions behind it. It is a coarser signal than a price, and it is one that cannot be moved by whoever is fastest to copy a large order.',
  },
  {
    q: 'What stops someone from never revealing a losing stake?',
    a: 'Nothing about the cryptography does — a commitment obliges you to nothing. The settlement rules handle it instead, and they are enforced in the contract: only revealed stakes count toward the pool, and a position that never reveals can never claim. Staying silent forfeits your entitlement rather than dodging a loss. The honest caveat is that v1 records entitlements rather than moving value, so forfeiting costs you a claim, not a balance. Escrowing at commit time would need shielded token transfers, which is deliberately out of scope here.',
  },
  {
    q: 'Can an observer still tell that I opened a position?',
    a: 'Yes. Commit transactions are individually visible, so the fact that a position was opened on a given side at a given time is public. What is not public is its size, which is the part a front-runner actually needs. If your threat model includes an adversary who cares that you participated at all, this is not sufficient for you, and we would rather say so here than in a post-mortem.',
  },
  {
    q: 'What is the zero-knowledge proof actually proving?',
    a: 'Two statements, at reveal time. First, that the amount you are now disclosing hashes — together with a salt only you hold — to the commitment you published before the outcome was known. Second, that the secret key behind the position is yours. Together they mean you cannot inflate a winning stake after the fact, and you cannot claim somebody else’s.',
  },
  {
    q: 'Why build this on Midnight rather than a general-purpose chain?',
    a: 'Midnight separates public ledger state from private witness data at the language level. A value stays private unless a circuit explicitly discloses it, which makes the security property auditable by reading the contract rather than by trusting an off-chain service to keep a secret. On a transparent chain the same design needs the amounts to live somewhere else, and that somewhere else becomes the thing you have to trust.',
  },
  {
    q: 'Is this live with real money?',
    a: 'No. Darkstake runs on Midnight Preprod testnet, the markets are illustrative, and nothing settles in real value. Do not treat anything on this page as financial advice or as an invitation to stake something you care about.',
  },
  {
    q: 'What happens if the resolver disappears?',
    a: 'In v1, the market cannot settle, and that is a real single point of failure rather than a hypothetical one. Because every stake is only a commitment until its owner reveals it, nothing is seized — but nothing pays out either. Removing that failure mode is exactly what the threshold-resolver and dispute-window stages are for.',
  },
];

export function Faq() {
  return (
    <Section id="faq" className="border-t border-border">
      <SectionHeading
        eyebrow="FAQ"
        title="The questions worth asking first."
        description="Including the ones with uncomfortable answers."
      />
      <div className="max-w-3xl">
        <Accordion type="single" collapsible>
          {FAQS.map((faq, i) => (
            <AccordionItem key={faq.q} value={`item-${i}`}>
              <AccordionTrigger>{faq.q}</AccordionTrigger>
              <AccordionContent>{faq.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </Section>
  );
}
