This is a series of actions that can be added to a [Pipedream](https://pipedream.com/) workflow in order to add books to a Notion Book Tracker template simply by submitting an ISBN-13 number.

Paired with a simple iOS Shortcut, you can use it to scan book barcodes with your phone and add them to Notion.

*In the near future, we'll include this workflow's functionality directly in [Flylighter!](https://flylighter.com/)*

## One-Click Workflow Template

[Use this template link to automatically add this workflow to your Pipedream account](https://go.thomasjfrank.com/pipedream-notion-book-scanner/)

If you don't have a Pipedream account, you'll be prompted to create one. This workflow works on Pipedream's free plan; it is fast and nearly always consumes just one credit.

## Compatibility

This workflow will work with any Notion database. The only required property is the default title property (usually called "Name"), which every database has.

However, this workflow is intended for use with book tracker templates. You can build your own, or [join my Notion Tips newsletter](https://thomasjfrank.com/fundamentals/#get-the-newsletter) to get notified when I release the **Ultimate Book Tracker Template** I'm currently building.

You can set properties for the following values:

* Author (text)
* Publish Year (number)
* Page Count (number)
* ISBN-13 (number)

These are all optional properties, and the workflow can run smoothly even if a book doesn't include one or more.

## Building this Workflow Yourself

I built this workflow primarily to help others learn how to create more advanced automations using the Notion API, Pipedream, and JavaScript code. I'll soon release a video tutorial walking through the whole process of building and deploying it.

If you'd like to build the workflow yourself, simply create a new Pipedream workflow with a basic HTTP trigger step. The trigger step should accept webhook events with a JSON body, which needs to include an `isbn` key with an ISBN-13 number as its value.

Example: `{"isbn": "9781517004446"}`

After that, the code steps should be added in the following order, and with the following step names:

1. Fetch_Book
2. Create_Notion_Page

You'll need to test the trigger and each action step. You'll also need to fill in the properties of the Create_Notion_Page step *after* testing Fetch_Books, so that you can reference the `steps.Fetch_Book.$return_value` in the **Book Information** field in Create_Notion_Page.

You can test the trigger by sending a request to your trigger URL using a tool like [ReqBin](https://reqbin.com/).

## Creating a Book Scanner Shortcut

If you have an iOS device, you can use the Shortcuts app to create a barcode-scanner shortcut that will send the ISBN number from a book's barcode to your Pipedream workflow.

The shortcut should have two steps:

1. Scan QR or barcode
2. Get Contents of URL

In the second step, add your trigger step's URL from your Pipedream workflow and set the Method to POST. The request body should be JSON, and shoudl have a single key called `isbn` with the value referencing the QR/Barcode step. That's it!

## More Resources

**More automations you may find useful:**

* [Create Notes in Notion with Your Voice](https://thomasjfrank.com/how-to-transcribe-audio-to-text-with-chatgpt-and-notion/)
* [Automated Recurring Tasks in Notion](https://thomasjfrank.com/notion-automated-recurring-tasks/)

**All My Notion Automations:**

* [Notion Automations Hub](https://thomasjfrank.com/notion-automations/)

**Want to get notified about updates to this workflow (and about new Notion templates, automations, and tutorials)?**

* [Join my Notion Tips newsletter](https://thomasjfrank.com/fundamentals/#get-the-newsletter)

## Support My Work

This workflow is **100% free** – and it gets updates and improvements! *When there's an update, you'll see an **update** button in the top-right corner of this step.*

If you want to support my work, the best way to do so is buying one of my premium Notion Templates:

* [Ultimate Brain](https://thomasjfrank.com/brain/) – the ultimate second-brain template for Notion
* [Creator's Companion](https://thomasjfrank.com/creators-companion/) – my advanced template for serious content creators looking to publish better content more frequently

Beyond that, sharing this automation's YouTube tutorial online or with friends is also helpful!

## Copyright

*I've made the code for this workflow public, so you can study it, use it as a learning tool, or modify it for **private, personal use**. Redistributing it, modified or unmodified, for free or paid, is not permitted.*