using Microsoft.Bot.Builder.Dialogs;
using Microsoft.Bot.Builder.Dialogs.Adaptive;
using Microsoft.Bot.Builder.Dialogs.Adaptive.Actions;
using Microsoft.Bot.Builder.Dialogs.Adaptive.Conditions;
using Microsoft.Bot.Builder.Dialogs.Adaptive.Generators;
using Microsoft.Bot.Builder.Dialogs.Adaptive.Input;
using Microsoft.Bot.Builder.Dialogs.Adaptive.Templates;
using Microsoft.Bot.Builder.LanguageGeneration;
using Microsoft.Extensions.Configuration;
using System.Collections.Generic;
using System.IO;

namespace AdaptiveOAuthBot.Dialogs
{
    public class RootDialog : AdaptiveDialog
    {
        private OAuthInput MyOAuthInput { get; }

        public RootDialog(IConfiguration configuration) : base(nameof(RootDialog))
        {
            // Using the turn scope for this property, as the token is ephemeral.
            // If we need a copy of the token at any point, we should use this prompt to get the current token.
            MyOAuthInput = new OAuthInput
            {
                ConnectionName = configuration["ConnectionName"],
                Title = "Please log in",
                Text = "This will give you access!",
                InvalidPrompt = new ActivityTemplate("Login was not successful please try again."),
                Timeout = 300000,
                MaxTurnCount = 3,
                Property = "turn.oauth",
            };


            string[] paths = { ".", "Dialogs", $"RootDialog.lg" };
            var fullPath = Path.Combine(paths);

            // These steps are executed when this Adaptive Dialog begins
            Triggers = new List<OnCondition>
                {
                    // Add a rule to welcome user
                    new OnConversationUpdateActivity
                    {
                        Actions = WelcomeUserSteps(),
                    },

                    // Respond to user on message activity
                    new OnUnknownIntent
                    {
                        Actions = LoginSteps(),
                    },
                };
            Generator = new TemplateEngineLanguageGenerator(Templates.ParseFile(fullPath));
        }

        private static List<Dialog> WelcomeUserSteps() => new List<Dialog>
            {
                // Iterate through membersAdded list and greet user added to the conversation.
                new Foreach()
                {
                    ItemsProperty = "turn.activity.membersAdded",
                    Actions =
                    {
                        // Note: Some channels send two conversation update events - one for the Bot added to the conversation and another for user.
                        // Filter cases where the bot itself is the recipient of the message. 
                        new IfCondition()
                        {
                            Condition = "$foreach.value.name != turn.activity.recipient.name",
                            Actions =
                            {
                                new SendActivity("Hello, I'm the multi-turn prompt bot. Please send a message to get started!")
                            }
                        }
                    }
                }
            };

        private List<Dialog> LoginSteps() => new List<Dialog>
            {
                MyOAuthInput,
                //new SendActivity("\\{turn.token.token} = `${turn.token.token}`."),
                new IfCondition
                {
                    Condition = "turn.oauth.token && length(turn.oauth.token)",
                    Actions = LoginSuccessSteps(),
                    ElseActions =
                    {
                        new SendActivity("Sorry, we were unable to log you in."),
                    },
                },
                new EndDialog(),
            };

        private List<Dialog> LoginSuccessSteps() => new List<Dialog>
            {
                new SendActivity("You are now logged in."),
                new ConfirmInput
                {
                    Prompt = new ActivityTemplate("Would you like to view your token?"),
                    InvalidPrompt = new ActivityTemplate("Oops, I didn't understand. Would you like to view your token?"),
                    MaxTurnCount = 3,
                    Property = "turn.Confirmed",
                },
                new IfCondition
                {
                    Condition = "=turn.Confirmed",
                    ElseActions =
                    {
                        new SendActivity("Great. Type anything to continue."),
                    },
                    Actions =
                    {
                        MyOAuthInput,
                        new SendActivity("Here is your token `${turn.oauth.token}`."),
                    },
                },
            };
    }
}
