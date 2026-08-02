# How far copyright reaches into a Recipe

Research for [#311](https://github.com/Zacplischka/dinner_app/issues/311) on map [#310](https://github.com/Zacplischka/dinner_app/issues/310). Verified against primary sources on 2026-08-02: the Copyright Act 1968 (Cth) at **Compilation No. 65, compilation date 2 April 2026**, the judgments cited below in their court-published or court-reproduced text, the US Copyright Office's own publications, EUR-Lex and legislation.gov.uk, and the named recipe sites' live `robots.txt` and terms pages.

**This is not legal advice and I am not a lawyer.** It is a summary of what the primary sources say. The places where a real lawyer is needed before the corpus ships are named explicitly in the last two sections; they are not a formality.

## The short answer

The map's premise **mostly holds, but is stated too confidently in one direction and too loosely in another**.

- It holds that a dish's identity, its ingredient set, and its functional steps are unprotected — but in Australia that is a *judge-made inference from originality and substantiality doctrine*, not a statutory exclusion. Australia has **no equivalent of 17 USC §102(b) or 37 CFR 202.1(a)**, and **no reported Australian judgment on copyright in a recipe at all**. The US "recipes are uncopyrightable" line is categorical; the Australian position is a prediction.
- It is too loose about the failure mode the ticket names. The reproduction right in Australia reaches a **substantial part** judged qualitatively, and reaches **non-literal copying**. Restating someone's method in fresh words is not automatically safe. What makes it safe is that the *only* thing carried across is fact and function.
- It understates one exposure: drawing systematically from **one** collection is a materially different risk from drawing from many, and Australian authority (§6) found infringement on exactly that pattern where every underlying fact was public.

## 1. What the statute actually gives the owner

| Provision | Text that matters |
| --- | --- |
| s 31(1)(a) | Copyright in a literary work is the exclusive right "to reproduce the work in a material form", "to publish the work", "to communicate the work to the public", "to make an adaptation of the work" |
| s 14(1)(a)–(b) | A reference to doing an act in relation to a work "shall be read as including a reference to the doing of that act in relation to a **substantial part**" |
| s 10(1) "literary work" | "includes: (a) a table, or compilation, expressed in words, figures or symbols" |
| s 10(1) "artistic work" | "a painting, sculpture, drawing, engraving or **photograph, whether the work is of artistic quality or not**" |
| s 10(1) "material form" | "any form (whether visible or not) of storage of the work or adaptation, or a substantial part of the work" |
| s 32(1)–(2) | Copyright subsists in an **original** literary work (originality is undefined by the Act) |
| s 36(1) | Infringement is doing, without licence, any act comprised in the copyright |

([Copyright Act 1968 (Cth), Compilation No. 65](https://www.legislation.gov.au/C1968A00063/latest/text))

Two consequences the map should absorb:

- **"Material form" includes non-visible storage.** Pulling a recipe page's text into a prompt, a scratch file, or a vector store is a reproduction in material form under s 31(1)(a)(i) read with the s 10 definition. It needs an exception, not an intention. See §9.
- **There is no idea/expression provision in the Act.** The dichotomy is judicial. The High Court states it plainly, but as doctrine rather than text: "Copyright does not protect facts or information. Copyright protects the particular form of expression of the information, namely the words, figures and symbols in which the pieces of information are expressed, and the selection and arrangement of that information." ([IceTV](https://www.hcourt.gov.au/sites/default/files/eresources/2009/HCA/14.pdf) at [28])

## 2. The Australian authority the premise stands on

**IceTV Pty Ltd v Nine Network Australia Pty Ltd [2009] HCA 14** ([official PDF](https://www.hcourt.gov.au/sites/default/files/eresources/2009/HCA/14.pdf)) — the load-bearing case. Nine's weekly TV schedule; IceTV took programme times and titles.

- [28] facts and information are not protected; only the form of expression and the selection and arrangement.
- [30] "In order to assess whether material copied is a substantial part of an original literary work, it is necessary to consider not only the extent of what is copied: **the quality of what is copied is critical**."
- [33] originality "means that the creation … of the work required some independent intellectual effort, but neither literary merit nor novelty or inventiveness as required in patent law."
- [40] "the more simple or lacking in substantial originality the copyright work, the greater the degree of taking will be needed before the substantial part test is satisfied."
- [42] the time-and-title expression "is not a form of expression which requires particular mental effort or exertion. The way in which the information can be conveyed is very limited … The authors … had **little, if any, choice in the particular form of expression adopted, as that expression was essentially dictated by the nature of the information**."
- [43] "Whether a selection or arrangement of elements constitutes a substantial part of a work depends on the degree of originality of that selection or arrangement." A chronological arrangement was "obvious and prosaic".
- [49], [54] skill and labour matter only insofar as they were "directed to the originality of the particular form of expression".

**Telstra Corporation Ltd v Phone Directories Company Pty Ltd [2010] FCAFC 149** — the White and Yellow Pages. Official home: [judgments.fedcourt.gov.au](https://www.judgments.fedcourt.gov.au/judgments/Judgments/fca/full/2010/2010fcafc0149) (that host refuses automated clients; the text below was read from the AustLII reproduction via [web.archive.org](http://web.archive.org/web/2023id_/http://www.austlii.edu.au/cgi-bin/viewdoc/au/cases/cth/FCAFC/2010/149.html)).

- [100] (Perram J) originality requires the work "originated … by an 'author'", the author "must be an actual person", and must bring "some 'independent intellectual effort'".
- [101] effort spent on the *anterior activity* of collecting information is not effort directed at the material form of the work.
- [118] where a program rather than a person fashions the material form, "the performance by a computer of functions ordinarily performed by human authors will mean that copyright does not subsist in the work thus created" — "a plane with its autopilot engaged is flying itself."
- [134] (Yates J) "In relation to works, an author is, under Australian law, a **human author**."
- The Full Court declined to follow the "industrious collection" reasoning of *Desktop Marketing* ([173]). **Sweat of the brow is dead in Australia.**

**Dynamic Supplies Pty Ltd v Tonnex International Pty Ltd [2011] FCA 362** ([AustLII, via web.archive.org](http://web.archive.org/web/2023id_/http://www.austlii.edu.au/cgi-bin/viewdoc/au/cases/cth/FCA/2011/362.html)) — a printer-cartridge compatibility chart. At [50]: "copyright does not protect mere facts, ideas or information contained in a compilation. Copyright protects the particular form of expression that is the compilation itself". Yet Tonnex infringed, because it took "the selection and ordering of items which originated with the author" ([134]–[135]).

**Fairfax Media Publications Pty Ltd v Reed International Books Australia Pty Ltd [2010] FCA 984** ([AustLII, via web.archive.org](http://web.archive.org/web/2023id_/http://www.austlii.edu.au/cgi-bin/viewdoc/au/cases/cth/FCA/2010/984.html)) — newspaper headlines and abstracts. At [44]: "Headlines generally are, like titles, simply too insubstantial and too short to qualify for copyright protection as literary works." At [84]: "A headline that does no more than repeat a phrase from the article is not an original literary work."

**There is no Australian recipe case.** I found no reported Australian judgment deciding copyright in a recipe. The highest-profile Australian dispute (the 2025 RecipeTin Eats / *Bake with Brooki* allegations) was resolved commercially without a judgment, so it produced no authority — only a demonstration that the reputational cost of *looking* like a copier lands well before any court does.

## 3. What may be taken

Each of these follows from *IceTV* [28] and [42] — they are information, or they are expression whose form is dictated by the information.

- **A dish's identity.** "Beef rendang", "chicken parmigiana", "shakshuka". A dish name is a name; *Fairfax* [44] puts titles and short phrases outside literary-work protection, and 37 CFR 202.1(a) says the same in the US. Naming a Recipe after the dish it is takes nothing.
- **The canonical ingredient set.** That rendang needs beef, coconut milk, lemongrass, galangal, chilli and kaffir lime is a fact about the dish, not one author's expression. This is the strongest part of the premise and it is where the two jurisdictions actually agree: *IceTV* [28] in Australia, and in the US an ingredient list is expressly "a mere listing of ingredients or contents" and unregistrable ([37 CFR 202.1(a)](https://www.ecfr.gov/current/title-37/chapter-II/subchapter-A/part-202/section-202.1); [Compendium (3d) §313.4(F)](https://www.copyright.gov/comp3/chap300/ch300-copyrightable-authorship.pdf)).
- **Quantities, ratios, times and temperatures.** "1.5 kg chuck", "braise 90 minutes at 160 °C", "rest 10 minutes". These are single items of quotidian information whose expression is essentially dictated (*IceTV* [42], on times specifically).
- **The functional sequence.** That you brown the meat, then bloom the spice paste, then add liquid, then braise. The order is causal, not authorial. In the US this is squarely §102(b) subject matter; in Australia it is the same conclusion by the [42] route — there is little choice in how to express it.
- **The fact that a particular source recommends something.** Knowing that a well-regarded rendang braises for 3 hours rather than 90 minutes is information you may act on.

Cooking the dish is not an infringement of anything. The Copyright Office puts the point beyond argument for the US: registration "will not cover … the underlying process for making the dish, **or the resulting dish itself**" ([Circular 33](https://www.copyright.gov/circs/circ33.pdf)).

## 4. What may not

- **Step wording.** The moment a step is written with real choice — voice, rhythm, sensory cues, a described "why" — it is expression with independent intellectual effort behind it, and s 14(1) reaches a substantial part of it. *IceTV* [40] says the thinner the originality the more you must take; the corollary is that a vividly written method is thin-taking territory. **"Sear until deeply mahogany and the fond is threatening to catch" is not a fact.**
- **Headnotes, intros, tips, anecdotes, wine pairings, serving suggestions.** These are the canonical protected layer and the US authority names them explicitly: cookbooks "in which the authors lace their directions … with musings about the spiritual nature of cooking", "suggestions for presentation, advice on wines to go with the meal, or hints on place settings and appropriate music", "tales of their historical or ethnic origin" ([*Publications International Ltd v Meredith Corp*, 88 F.3d 473, 480–81 (7th Cir 1996)](https://law.resource.org/pub/us/case/reporter/F3/088/88.F3d.473.95-3530.95-3485.html)).
- **Photographs — every one of them, without exception.** s 10(1) protects a photograph "whether the work is of artistic quality or not". There is no de minimis for a photo. Nothing about the map's AI-image decision may be softened.
- **A distinctive selection-and-arrangement of a collection.** s 10(1) makes a compilation a literary work, and *IceTV* [43] protects a selection or arrangement to the extent it is original. "Nagi's 30 best midweek dinners" is a curated selection; reproducing that selection is taking the compiler's expression even if you re-author every entry inside it. Bare alphabetical or chronological orders are "obvious and prosaic" and take nothing (*IceTV* [43]).
- **Anything you copied and then lightly edited.** See next section.

## 5. The close-paraphrase line — the failure mode to design against

This is where the premise is most exposed and where an LLM pipeline drifts by default. Four propositions, each from a primary source:

1. **Non-literal copying infringes.** In *Baigent v Random House* ([2007] EWCA Civ 247) the Court of Appeal treated non-textual copying as a real cause of action and decided it on substantiality, not on the absence of shared words. The claim failed only because what was taken was "at too high a level of abstraction", "on the wrong side of the line between ideas and the expression of ideas" ([96], [187], [260]) — and because "It must be shown that **the architecture or structure is substantially copied**" ([214], quoting the trial judge). ([BAILII](https://www.bailii.org/ew/cases/EWCA/Civ/2007/247.html), read via [web.archive.org](http://web.archive.org/web/2023id_/https://www.bailii.org/ew/cases/EWCA/Civ/2007/247.html))
2. **The test is qualitative.** *IceTV* [30]: "the quality of what is copied is critical". A short passage carrying the author's distinctive expression is a substantial part; a long passage of pure fact is not.
3. **Idiosyncrasy is the evidence.** In *Dynamic Supplies* the finding of copying rested on "indicia of copying" — the quirks in the source that had no reason to appear in the copy — and the court then inferred that "the extent of copying was far greater than that" ([136]). A pipeline that faithfully carries across a source's unusual phrasing, its odd step-splitting, its typo'd quantity, or its idiosyncratic ordering hands over both the finding *and* the inference that more was taken than can be proved.
4. **Effort spent restating is not effort that earns you anything.** *Telstra v PDC* [101]: effort directed at an anterior activity, not at the form of expression, does not make you an author. Rewording someone else's sentences is anterior effort. It does not create your own originality; it only obscures theirs.

**Where the line sits, operationally.** The safe operation is *fact extraction followed by independent authorship*, not *rewriting*. The distinction is whether the source text is present at the moment of writing:

- **Safe.** Read several sources → record only the fact set (ingredient identities, quantities, temperatures, times, the causal order) → close the sources → author the method from the fact set in Dinder's own AU voice and structure.
- **Unsafe, and this is the default an LLM produces.** Put one source's method in context and ask for a rewrite. Sentence-for-sentence correspondence survives synonym substitution, and sentence-for-sentence correspondence *is* the architecture *Baigent* says must not be substantially copied.

Concretely for the pipeline: **no source text may be in context when a Recipe's method is authored.** A structured fact record must sit between reading and writing, and the reading stage must be forbidden from emitting prose. A pipeline that can produce a close paraphrase is one prompt-regression away from producing one at scale, across 1000 Recipes, in a shippable product — and s 115(4) lets a court award **additional damages** having regard to "the flagrancy of the infringement", "the need to deter", and whether the infringement was "on a commercial scale" (s 115(5)–(6)).

## 6. One source versus many

**Yes — drawing systematically from one collection creates an exposure that drawing from many does not.** Three independent reasons:

- **Compilation copyright is a real, separate work.** s 10(1) makes a compilation a literary work; *IceTV* [43] protects its selection and arrangement to the extent original. Taking *which* recipes a site chose to publish, in the groupings it chose, reproduces that selection even if every ingredient list inside is fact.
- **Australian authority has already found infringement on exactly this pattern.** *Dynamic Supplies* [134]–[139]: every OEM code and printer model in the chart was public information, yet reproducing the selection and ordering of a competitor's compilation was a reproduction of a substantial part. Five of nine columns repeated "in the same sequence" was itself treated as evidence.
- **In the UK and EU there is a second right that Australia does not have.** The sui generis database right subsists "if there has been a substantial investment in obtaining, verifying or presenting the contents", **whether or not the contents are copyright works** ([Copyright and Rights in Databases Regulations 1997, reg 13](https://www.legislation.gov.uk/uksi/1997/3032/regulation/13)). And critically: "the **repeated and systematic extraction** or re-utilisation of insubstantial parts … may amount to the extraction or re-utilisation of a substantial part" ([reg 16(2)](https://www.legislation.gov.uk/uksi/1997/3032/regulation/16)). The CJEU reads Art 7(5) as catching acts "the cumulative effect of which is to reconstitute … the whole or a substantial part of the contents" ([*BHB v William Hill*, C-203/02, operative part 4](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:62002CJ0203)). Systematically working through one UK or EU recipe site is the paradigm case this right exists to catch. (It is bounded: investment in *creating* the data does not count — *BHB* operative part 1 — and it does not exist in Australia or the US.)

**The practical rule that falls out:** source each Recipe from a minimum of three independent sources and never reproduce any one source's selection, grouping, or ordering. Coverage should be driven by the demand-weighting the map already decided on, never by walking a site's index or sitemap — walking an index is precisely how a compilation gets reproduced by accident.

## 7. Attribution

**Attribution changes nothing about infringement. Say it plainly and design accordingly.**

- Nothing in s 36 or s 31 conditions infringement on the absence of credit. Acknowledgement is an element of exactly two fair dealings — s 41 (criticism or review) and s 42(1)(a) (reporting news in a periodical) — neither of which describes authoring a commercial Recipe corpus.
- Attribution is a *separate right the author holds against you* (s 193, s 194), not a licence you can take. It arises when you reproduce, publish, communicate or adapt the work; s 195AR only excuses non-attribution where it was reasonable in all the circumstances. It is a duty added to infringement, never a cure for it.
- The premise cuts the other way too: if the re-authoring is genuine, **no moral right is engaged at all**, because no protected work has been reproduced.

This has a direct consequence for the Cook View. `CONTEXT.md` defines the Cook View as "Closed by one source credit naming the originating recipe site with a backlink — a licence obligation of the recipe supply". That obligation is **Spoonacular's, arising from Spoonacular's licence**. An Owned Recipe has no originating site. Filling that slot with a "researched from X" credit would be actively harmful: it neither obtains a licence nor supplies a defence, it asserts a derivation the map's whole provenance decision says does not exist, and it is a written admission of access and copying that a plaintiff would otherwise have to prove. **Owned Recipes must render no source credit, and the Cook View must treat the missing credit as correct rather than as a defect.**

## 8. Do the US and UK differ in a way that changes what we may do?

The source material will be largely US and UK. The short answer: **the acts we perform are governed by Australian law, and Australia is the least categorical of the three on recipes but has no extra right of the kind the UK has.**

| | Australia | United States | UK / EU |
| --- | --- | --- | --- |
| Idea/expression exclusion | Judge-made only (*IceTV* [28]); no statutory text | Statutory: 17 USC §102(b) excludes "any … procedure, process, system, method of operation" | Judge-made + CJEU: functionality and ideas are not protected |
| Ingredient lists | No authority; predicted unprotected via *IceTV* [42] | **Expressly excluded**: "mere listing of ingredients or contents", 37 CFR 202.1(a); Copyright Office will not register ([Circular 33](https://www.copyright.gov/circs/circ33.pdf)) | No express rule; "author's own intellectual creation" standard |
| Recipe method | No authority | "fall squarely within the class of subject matter specifically excluded … by 17 USC §102(b)" (*Meredith*, 88 F.3d at 480–81) | No express rule |
| Originality standard | "independent intellectual effort" directed at the form of expression; human author required (*IceTV* [33]; *Telstra* [100], [134]) | "modicum of creativity"; sweat of the brow rejected (*Feist*, 499 US 340) | "author's own intellectual creation" ([*Infopaq*, C-5/08](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:62008CJ0005)) |
| Compilations | Thin; selection/arrangement only (*IceTV* [43]) | Thin: "only the compiler's selection and arrangement may be protected; the raw facts may be copied at will" (*Feist*) | Same standard; "the intellectual effort and skill of creating that data are not relevant" ([*Football Dataco*, C-604/10, operative part 1](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:62010CJ0604)) |
| **Sui generis database right** | **None** | **None** | **Yes** — reg 13, and reg 16(2) catches repeated systematic extraction |
| How small a taking can infringe | Qualitative substantial part (s 14; *IceTV* [30]) | Substantial similarity of protected expression | An 11-word extract can be a reproduction in part if it expresses the author's intellectual creation (*Infopaq*, operative part 1) |
| Commercial TDM / AI-training exception | **None, and expressly ruled out** | Fair use, unsettled and litigated | UK s 29A is **non-commercial research only** ([CDPA s 29A](https://www.legislation.gov.uk/ukpga/1988/48/section/29A)) |

Three things that actually change what we do:

1. **Do not import the US comfort level.** *Meredith* and the Compendium make US recipes feel categorically free. Australia has no such rule, and *IceTV* is an originality-and-substantiality analysis that could come out differently for a method written with real authorial choice. Treat the US authority as persuasive support for the *ingredient list and functional steps*, and as **no support at all** for taking anything written with voice.
2. **UK and EU sources carry a right Australian sources do not.** Working systematically through a UK or EU recipe site risks the sui generis database right even where every recipe is unprotected — this is the one place where *where the source lives* changes the answer. Prefer breadth across jurisdictions and never depth into one UK/EU collection.
3. **There is no Australian TDM or AI-training exception, and the government has ruled one out.** The Attorney-General's Department stated on 26 October 2025 that the government "is consulting on possible updates to Australia's copyright laws – while reiterating that this will not include a Text and Data Mining Exception", and that "by ruling out a Text and Data Mining Exception" it is "providing certainty to Australian creators" ([media release](https://ministers.ag.gov.au/media-centre/albanese-government-ensure-australia-prepared-future-copyright-challenges-emerging-ai-26-10-2025)). Anything the pipeline copies must fit an existing exception or a licence. Reverify this before launch — CAIRG's licensing and enforcement workstreams were live at the time of writing.

## 9. The pipeline's own copying is a separate act

Distinct from what ends up in the corpus. Reading a recipe page and putting its text into an LLM prompt is a reproduction in a material form (s 31(1)(a)(i) with the s 10 "material form" definition, which expressly covers non-visible storage).

- **s 43A / s 43B** excuse only *temporary* reproductions made as a necessary part of a technical process, and s 43B(3) expressly does not extend to "any subsequent use of a temporary reproduction … other than as a part of the technical process in which the temporary reproduction was made". An ordinary browser fetch is comfortably inside this. Retaining page text in a research file, a prompt log, or an embedding store is not obviously inside it.
- **s 40 fair dealing for research or study** is the only realistic exception, and it is a poor fit for building a commercial product: s 40(2) requires regard to "the purpose and character of the dealing" and "the effect of the dealing upon the potential market for, or value of, the work". Australia has **no fair use**. The reasonable-portion safe harbours in s 40(5) (10% or one chapter) are drafted for study, and a recipe is a whole work.
- The lazy and correct design: **the fact record is the only artefact that persists.** Source text is read, facts are extracted, source text is discarded and never written to disk or to a prompt log. That also happens to be the design that makes close paraphrase structurally impossible (§5), so one control buys both.

## 10. Terms of service — reported separately from copyright

**ToS is contract, and it is independent of copyright.** The CJEU decided precisely this: where a database is protected by neither copyright nor the sui generis right, the Database Directive "[does] not preclude the author of such a database from laying down contractual limitations on its use by third parties" ([*Ryanair v PR Aviation*, C-30/14](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:62014CJ0030)). Concluding that a recipe is unprotected settles the copyright question and settles nothing about the contract question.

**What the actual sources say — read live on 2026-08-02:**

- **taste.com.au** (News Corp Australia — an Australian publisher, Australian law): its `robots.txt` opens with "NOTICE: Collection of content and other data on www.taste.com.au through automated means is prohibited unless you have express written permission from the publisher" ([robots.txt](https://www.taste.com.au/robots.txt)). Its terms go further: "you shall not … access, collect, text or data mine any Content from any of the Media by automated means", and "you shall not use any Content for any machine learning or artificial intelligence (AI) purposes, including … developing, building, training, fine tuning, or grounding or otherwise utilizing Content in any large language models (LLMs)". It also forecloses the robots.txt argument in terms: "your rights are not expanded, nor are any prohibitions modified or limited, in any way by our use or configuration of exclusionary protocols (e.g., the Robots Exclusion Protocol as implemented through robots.txt files)" ([legal notices, cl 18](https://www.taste.com.au/articles/legal-notices/MUfw5jyc)).
- **allrecipes.com / seriouseats.com** (People Inc): `robots.txt` states content "is made available for your non-commercial use", and that prohibited uses include "development or operation of any artificial intelligence, machine learning, or large language model (LLM) technology, including by training or fine-tuning such technology or **using it for retrieval-augmented generation**" ([robots.txt](https://www.allrecipes.com/robots.txt)). The terms bind the same way: "you shall not use any manual or automated software … to 'scrape,' harvest, or download data from the Services" and "you shall not use any data from the Services for the development of any software program (including but not limited to training a machine learning or artificial intelligence (AI) system)" ([Terms of Service](https://www.people.inc/brands-termsofservice)).
- **recipetineats.com**: `robots.txt` disallows `anthropic-ai`, `Claude-Web`, `CCbot`, `PiplBot` and `FacebookBot` from the whole site, while allowing `*` ([robots.txt](https://www.recipetineats.com/robots.txt)).

**How much of that actually binds us:**

- **A logged-out reader is not obviously a contracting party.** Australian courts enforce online terms where they are incorporated by signature or by reference — in *Gonzalez v Agoda Company Pte Ltd* [2017] NSWSC 1133 the court found incorporation from a click of "Book Now" over a visible link to the terms, applying ordinary signature and incorporation principles ([122]–[124]) ([AustLII, via web.archive.org](http://web.archive.org/web/2023id_/http://www.austlii.edu.au/cgi-bin/viewdoc/au/cases/nsw/NSWSC/2017/1133.html)). We do none of that. On closely analogous facts in the US, Meta's terms were held not to reach a non-account-holder: the court concluded "Bright Data did not 'use' Facebook and Instagram when it engaged in logged-off scraping of public data" ([*Meta Platforms, Inc. v Bright Data Ltd.*, No. 23-cv-00077-EMC (N.D. Cal. 23 Jan 2024), Dkt 181](https://storage.courtlistener.com/recap/gov.uscourts.cand.406956/gov.uscourts.cand.406956.181.0_1.pdf)). Persuasive, not binding, and turned on those particular terms.
- **No criminal exposure for reading public pages.** Criminal Code Act 1995 (Cth) s 478.1 reaches "restricted data", defined as data "to which access is restricted by an access control system associated with a function of the computer". A page served to any browser is not that. The US position is the same: the CFAA's "without authorization" is limited "to computers for which authorization or access permission, such as password authentication, is generally required" ([*hiQ Labs v LinkedIn*, 31 F.4th 1180 (9th Cir 2022)](https://cdn.ca9.uscourts.gov/datastore/opinions/2022/04/18/17-16783.pdf)).
- **`robots.txt` is not a contract and not a statute** — but a `Disallow` naming an AI agent is unambiguous notice of the publisher's position, and taste.com.au's clause shows publishers now argue robots.txt neither grants nor limits anything. Ignoring an explicit `Disallow` for `anthropic-ai` converts a contestable act into a deliberate one, which is exactly the "flagrancy" input in s 115(4)(b)(i).

**Which risk class does reading recipe pages for research fall into?**

Measured on the access axis, it sits **at or below ADR 0010's class, and clearly below ADR 0004's**:

| | ADR 0004 (Apify → DoorDash/Uber Eats) | ADR 0010 (Woolworths search API) | Recipe research reading |
| --- | --- | --- | --- |
| Third-party vendor in the loop | Yes | No | No |
| Scraping / HTML extraction | Yes | No | No — pages read as served |
| Anti-bot posture | Vendor-mediated | Passes as-is, honest identity headers | Same; a `Disallow` is honoured, not routed around |
| Volume | Per user request | Self-rate-limited, cache-first | Hundreds of reads, one time, offline |
| ADR's own verdict | "violates their consumer terms even via a vendor" | "distinct and lower risk class … no vendor, no scraping, no circumvention" | — |

But **the access axis is not the axis that matters here, and neither ADR covers the one that does.** ADR 0004 and ADR 0010 read *prices* — facts nobody claims as expression, feeding an output that competes with nobody. Recipe research reads *creative works* and produces a commercial corpus in the same market as the sources. Every one of the ToS clauses quoted above is aimed squarely at that, not at bot traffic. So:

> **Recipe research reading is ADR 0010's access class carrying ADR 0004's commercial-conflict risk, on an axis neither ADR has ever assessed. It needs its own ADR; it is not an amendment to either.**

That ADR's operative commitments should be, at minimum: honour every `Disallow`; never route around a block (inheriting #240's commitment made durable in ADR 0010); comply immediately on objection; hold no source text after fact extraction; never take a source's selection or ordering; and never render a source credit on an Owned Recipe.

## 11. What is genuinely unsettled

Stated as uncertainty rather than dressed up as an answer.

- **Whether copyright subsists in an individual recipe under Australian law.** No Australian court has decided it. A bare list plus terse imperative steps most likely fails *IceTV* [42] — the form is dictated by the information. A method written with real authorial voice most likely succeeds. **Where between those a typical food-blog method sits is unknown**, and the answer is not "recipes are not copyright" in Australia the way it is in the US.
- **How much of a method may be paraphrased before a substantial part is taken.** The test (*IceTV* [30], quality not quantity) is clear; its application to a 6-step braise is not. There is no Australian bright line and no Australian recipe case to calibrate against.
- **Whether s 40 fair dealing for research covers reading sources to build a commercial corpus.** s 40(2)(a) and (d) both cut against it. It has not been tested on these facts.
- **Whether a logged-out, non-account-holding reader is bound by a site's terms in Australia.** *Gonzalez v Agoda* is about a clickwrap booking. Nothing Australian squarely decides the browsewrap case, and *Bright Data* is a US district court reading Meta's particular wording.
- **Whether Australia's AI/copyright settings hold.** The TDM exception is ruled out as of 26 October 2025, but CAIRG is actively examining "a new paid collective licensing framework under the Copyright Act … for AI". A licensing regime could change the calculus in either direction. Reverify before the ~1000-Recipe run is paid for.

## 12. Where a lawyer is needed before this ships

Not a disclaimer — three specific questions that a summary of primary sources cannot close, and that the map's own "commercially shippable or it doesn't ship" constraint makes load-bearing:

1. **Sign-off on the re-authoring standard itself**, against a real sample of pipeline output — not the policy, the artefacts. The question a lawyer must answer is whether a given Owned Recipe, put beside the sources it was researched from, reads as independent authorship or as an altered copy. That is a judgement about specific text, and it is the one the map's whole provenance decision rests on.
2. **The reading stage**, if any source text is retained past the moment of extraction. If the pipeline holds no source text, this is small. If it caches pages, logs prompts, or embeds source text, it needs advice on s 40 and ss 43A/43B, because there is no Australian TDM exception to fall back on.
3. **A named source list with jurisdictions attached**, reviewed once. The UK/EU sui generis database right and the AI-specific ToS clauses quoted in §10 mean the answer is genuinely source-dependent, and reading systematically from a single UK or EU collection is the one pattern with an identified legal hook attached to it.

## Items not confirmable from these sources

- **judgments.fedcourt.gov.au and austlii.edu.au both refuse automated clients.** *Telstra v PDC*, *Dynamic Supplies*, *Fairfax v Reed*, *Gonzalez v Agoda* and *Baigent* were read from web.archive.org snapshots of the AustLII and BAILII reproductions. Paragraph numbering and quoted text are consistent with the citing references in the judgments I read from official sources, but these are reproductions, not court-published files. *IceTV* is the High Court's own PDF; the Copyright Act is the Federal Register of Legislation's own compilation; *Meredith*, *hiQ*, *Bright Data* and the CJEU judgments are from law.resource.org, ca9.uscourts.gov, the RECAP archive of the court's own filing, and EUR-Lex respectively.
- **ecfr.gov blocks automated fetch.** 37 CFR 202.1(a) was read via Cornell LII and independently corroborated by the Copyright Office's own [Compendium §313.4(F)](https://www.copyright.gov/comp3/chap300/ch300-copyrightable-authorship.pdf) and [Circular 33](https://www.copyright.gov/circs/circ33.pdf), which quote and apply it.
- **17 USC §102(b) and *Feist*** were read via Cornell LII; §102(b)'s text is independently corroborated verbatim in *IceTV* footnote 65 and in *Meredith*.
- **`robots.txt` and terms pages are mutable.** The clauses in §10 were read on 2026-08-02 and are the publishers' current position, not a permanent one. They must be re-read against the actual source list at the time the corpus is built, and again before it ships.
- **No primary source can tell you whether a particular re-authored Recipe is far enough from its sources.** That is a fact question about specific text, decided case by case. Nothing in this document substitutes for looking at the artefacts.
