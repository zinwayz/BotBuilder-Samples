using System.Collections.Generic;
using System.IO;
using System.Linq;
using Microsoft.Bot.Builder.AI.Luis;
using Microsoft.Bot.Builder.Dialogs;
using Microsoft.Bot.Builder.Dialogs.Adaptive;
using Microsoft.Bot.Builder.Dialogs.Adaptive.Actions;
using Microsoft.Bot.Builder.Dialogs.Adaptive.Conditions;
using Microsoft.Bot.Builder.Dialogs.Adaptive.Generators;
using Microsoft.Bot.Builder.Dialogs.Adaptive.Input;
using Microsoft.Bot.Builder.Dialogs.Adaptive.Templates;
using Microsoft.Bot.Builder.LanguageGeneration;
using Microsoft.Extensions.Configuration;

namespace AdaptiveOAuthBot.Dialogs
{
    public class RootDialog : AdaptiveDialog
    {
        private OAuthInput MyOAuthInput { get; }
        private readonly Templates _templates;

        public RootDialog(IConfiguration configuration) : base(nameof(RootDialog))
        {
            var fullPath = Path.Combine(".", "Dialogs", "RootDialog.lg");
            _templates = Templates.ParseFile(fullPath);
            Generator = new TemplateEngineLanguageGenerator(_templates);

            // This implies the LUIS model has been published prior to running the bot.
            // This should be done through the consumption of a .dialog file?
            Recognizer = new LuisAdaptiveRecognizer
            {
                ApplicationId = configuration[$"{nameof(RootDialog)}:luis:en_us_appId"],
                EndpointKey = configuration[$"{nameof(RootDialog)}:luis:key"],
                Endpoint = configuration[$"{nameof(RootDialog)}:luis:hostname"],
            };

            // Just loop when the inner dialog stack is empty, instead of ending and restarting.
            AutoEndDialog = false;

            // Using the turn scope for this property, as the token is ephemeral.
            // If we need a copy of the token at any point, we should use this prompt to get the current token.
            // Only leave the prompt up for 1 minute. (Is there a way to not reprompt if this times-out?)
            MyOAuthInput = new OAuthInput
            {
                ConnectionName = configuration["ConnectionName"],
                Title = _templates.Evaluate("SigninTitle").ToString(),
                Text = _templates.Evaluate("SigninText").ToString(),
                InvalidPrompt = new ActivityTemplate("${SigninReprompt()}"),
                Timeout = 15000,
                MaxTurnCount = 3,
                Property = "turn.oauth",
            };
            Dialogs.Add(MyOAuthInput);

            // These steps are executed when this Adaptive Dialog begins
            Triggers = new List<OnCondition>
                {
                    // Add a rule to welcome the user.
                    new OnConversationUpdateActivity
                    {
                        Actions =
                        {
                            new CodeAction(async (dc, opt) =>
                            {
                                var activity =dc.Context.Activity.AsConversationUpdateActivity();
                                var botId = activity.Recipient.Id;
                                if (activity.MembersAdded.Any(m => m.Id != botId))
                                {
                                    var text = _templates.Evaluate("WelcomeMessage").ToString();
                                    await dc.Context.SendActivityAsync(text);
                                }
                                return await dc.EndDialogAsync();
                            }),
                            new EndDialog(),
                        }
                    },

                    // Allow the user to sign out.
                    new OnIntent("Logout")
                    {
                        Actions =
                        {
                            new CodeAction(async (dc, opt) =>
                            {
                                await MyOAuthInput.SignOutUserAsync(dc);
                                return await dc.EndDialogAsync();
                            }),
                            new SendActivity("${SignoutCompleted()}"),
                            new CancelAllDialogs(),
                        }
                    },

                    // Respond to user on message activity.
                    new OnUnknownIntent
                    {
                        Actions =
                        {
                            MyOAuthInput,
                            new IfCondition
                            {
                                Condition = "turn.oauth.token && length(turn.oauth.token) > 0",
                                Actions = LoginSuccessSteps(),
                                ElseActions =
                                {
                                    new SendActivity("${SigninFailed()}"),
                                },
                            },
                            new EndDialog(),
                        }
                    },
                };
        }

        private List<Dialog> LoginSuccessSteps() => new List<Dialog>
            {
                new SendActivity("${SigninSuccess()}"),
                new ConfirmInput
                {
                    Prompt = new ActivityTemplate("${ShowTokenPrompt()}"),
                    InvalidPrompt = new ActivityTemplate("${ShowTokenReprompt()}"),
                    MaxTurnCount = 3,
                    Property = "turn.Confirmed",
                },
                new IfCondition
                {
                    Condition = "=turn.Confirmed",
                    Actions =
                    {
                        MyOAuthInput,
                        new SendActivity("${ShowToken()}"),
                    },
                    ElseActions =
                    {
                        new SendActivity("${ShowTokenDeclined()}"),
                    },
                },
            };
    }
}
