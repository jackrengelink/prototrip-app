# Organizer guide

How to set up the trip, put the schedule in and keep everyone up to date.

## Who can do what

| | Participant | Organizer | Admin |
| --- | :---: | :---: | :---: |
| See the participant schedule, news, info, organizer phone numbers | ✅ | ✅ | ✅ |
| See organizer-only items, organizer notes, tasks, private details of people | | ✅ | ✅ |
| Add / edit / remove schedule, news, info pages, people, groups | | ✅¹ | ✅ |
| Manage tasks | | ✅ | ✅ |
| Change trip details and codes, import/restore backups, reset | | | ✅ |

¹ Unless the admin switches off *Organizers can edit the trip* (Manage → Trip details).

Everybody signs in with a code: the **participant code** for the group, the **organizer code** for the organizers, and the **admin password** for you.

## 1. Trip details

Sign in with the admin password and open **Manage → Trip details**:

- **First / last day** – used for the day tabs and the "Day 2 of 5" counter.
- **Time zone of the destination** – all schedule times are entered and shown in this time zone. If someone's phone is still on Dutch time, the app shows a small note but keeps showing local trip times (which is what you want on the trip).
- **Local emergency number**, **welcome message**, **default language** and **accent colour**.
- **Codes** – you can type your own (e.g. `BARCELONA27`) or generate new ones.

## 2. People and groups

Under **People** add the organizers (role *Organizer*, with a title like *Chair* and a phone number) and the participants. Or import a list: **Manage → Import from a spreadsheet → People** (columns like *Name, Role, Groups, Phone, Email, Dietary, Emergency contact*; a *Voornaam* + *Achternaam* pair works too).

**Groups** are optional. Use them when people have different programmes – *Group A / Group B*, rooms, buses, workshop tracks. An event can then be limited to one or more groups. People who chose their name see their own group's programme with *Only mine*.

Phone numbers of **organizers** are visible to everybody (so participants can call you). Phone numbers, dietary info, emergency contacts and notes of **participants** are only visible to organizers.

## 3. The schedule

### One by one

**Schedule → +**. Only *title* and *date* are required.

- Leave the start time empty for an all-day item (e.g. "Copenhagen Card valid"). Use *More options → Last day* for multi-day items.
- An end time earlier than the start time means it runs past midnight (22:00 – 06:00 night bus).
- **Who can see this?** → *Everyone* or **Organizers only**. This is how you keep the organizer schedule separate: briefings, "collect keys at reception", "pay museum tickets", the evening evaluation…
- **Organizer notes (private)** – booking numbers, supplier phone numbers, "pay with the trip credit card". Participants never see them, even on a participant event.
- **Organizer(s) in charge** – shows who to call for this item.
- **Copy** an event with the duplicate button on its page (handy for daily breakfasts).

### From a spreadsheet

Most organizers already have the programme in Excel or Google Sheets. Go to **Manage → Import from a spreadsheet → Schedule** and either upload a CSV file or select the cells (including the header row) and paste them.

Recognised columns (English or Dutch, in any order):

| Column | Examples of headers | Notes |
| --- | --- | --- |
| Date | Date, Datum, Dag | `2027-03-01`, `01-03-2027`, `1/3`, `ma 1 maart`. A row without a date uses the date above it. |
| Start / End | Start, Begin, Van / End, Eind, Tot | `09:30`, `9.30`, `9u`. A range like `09:00-10:30` in one cell works too. |
| Title | Title, Titel, Activiteit, Wat, Programma | required |
| Location / Address | Location, Locatie, Waar / Address, Adres | |
| Audience | Audience, Voor, Doelgroep | `organizers` / `organisatie` / `orga` → organizers only; anything else → everyone |
| Groups | Groups, Groep | comma separated; unknown groups are created |
| In charge | In charge, Verantwoordelijke, Wie | names of organizers (first name is enough) |
| Category | Category, Categorie, Type | optional – otherwise guessed from the title (lunch → food, train → travel…) |
| Description, Organizer notes, Bring, Meeting point, Cost, Link, Status | Beschrijving, Interne notities, Meenemen, Verzamelpunt, Kosten, Link, Status | |

You get a preview with any problems per row before anything is saved. *Add to the current schedule* keeps existing events; *Replace the current schedule* starts over (a backup is made first). **Download template** gives you a ready-made file.

## 4. Info pages

**Info** has starter pages (Practical info, Packing list, Emergency, and an organizer-only handbook). Edit them with simple formatting:

```
## Heading
**bold**, *italic*, [a link](https://example.org)
- a bullet
- [ ] a checklist item (everyone can tick it off on their own phone)
```

Pages can be *Organizers only* too – useful for the organizer handbook, budget or supplier contacts.

## 5. Sharing

**Manage → Access & sharing** shows for both participants and organizers:

- the **code**,
- a **join link** (opening it signs people in straight away – great for the group chat),
- a **QR code**, which you can print as a poster for the info evening.

Ask everyone to:

1. open the link,
2. choose their name (top of the Today screen),
3. *Me → Install the app* (adds it to the home screen; then it works offline),
4. *Me → Notifications → Turn on*,
5. optionally *Me → Your calendar → Subscribe*.

If a code ends up in the wrong hands: change it under Trip details and use **Sign out all devices** for that role.

## 6. During the trip

- **Changes:** edit the event, type a *change note* ("Now leaving at 09:12 instead of 09:00") and switch on **Send a notification**. Everyone sees an *Updated* label and the note. Prefer *Status → Cancelled* over deleting, so people notice.
- **News:** post an announcement (*Info*, *Important* or *Urgent*), pin it if it should stay on top, and send a notification.
- **Tasks:** quick-add tasks on the Tasks tab, assign them to organizers and tick them off. *Mine* shows what's on your plate; the Today screen shows your open tasks too.
- **Head count:** open the event (e.g. "Meet at the station") → *Start head count* and tap names as people arrive. Missing people are listed first with a call button. Every organizer sees the same ticks, so you can count with several people at once. It only lists the participants of the event's groups.
- **Dietary overview:** People → *Dietary overview* gives the list for the restaurant.

The app refreshes every 30 seconds while open and whenever it's brought back to the front. Without internet it shows the last version it downloaded (with an *Offline* label).

## 7. After the trip

Download a full backup (**Manage → Backup & export**). For the next trip you can restore it, or use **Reset everything** (keeps the codes and password) and start fresh.
