// examples.js: what the moderator learns from.
//
// There is no list of banned words here. Each category is described by EXAMPLE
// SENTENCES, and a new message is judged by how close its MEANING is to them.
// To teach the moderator something new, add a sentence to the right list. To fix
// a false alarm, add a sentence like it to `safe`.
//
// `safe` matters as much as the harmful lists. This is a news chat, so harsh
// criticism of governments, politicians and ideas is normal and allowed. Without
// safe examples like that, anything angry would look like an attack.
//
// Keep these separate from test-cases.js. Testing on the same sentences the
// moderator learned from would make it look better than it really is.

const CATEGORIES = {
  // Attacking or insulting another person in the chat
  harassment: {
    label: 'a personal attack',
    examples: [
      "you're an idiot",
      'you are so stupid it hurts',
      'shut up, nobody asked you',
      "you're worthless and everyone here knows it",
      'what a pathetic loser you are',
      'nobody likes you, just leave',
      "you're too dumb to understand anything",
      'go away, you clown',
      'you are a disgusting human being',
      "you're the dumbest person in this chat",
      'learn to read, moron',
      "you're a joke and so is everything you say",
    ],
  },

  // Threatening violence or harm against someone
  threat: {
    label: 'a threat',
    examples: [
      "I'm going to find you and hurt you",
      'keep talking and see what happens to you',
      'I know where you live',
      "you'd better watch your back",
      "I'll make sure you regret saying that",
      'someone should shoot you',
      "I'm going to beat you up",
      'you will pay for this, I promise',
      'wait until I find out who you are',
      'I hope someone breaks your legs',
    ],
  },

  // Telling someone to hurt or kill themselves
  self_harm: {
    label: 'encouraging self-harm',
    examples: [
      'go kill yourself',
      'you should just end it',
      'do everyone a favor and disappear forever',
      'nobody would miss you if you died',
      'jump off a bridge',
      'the world would be better without you in it',
      'why are you still alive',
      "just stop breathing, it'd help us all",
    ],
  },

  // Dehumanizing or calling for harm against a group of people
  hate: {
    label: 'hate toward a group',
    examples: [
      'those immigrants are vermin and should be thrown out',
      'they are animals, not people',
      'that whole religion is a disease that should be wiped out',
      'people like them should not be allowed to exist',
      'their race is inferior to ours',
      'they are subhuman parasites',
      'we need to get rid of all of them',
      'gay people are disgusting and sick',
      'women are too stupid to vote',
      'those people are a plague on this country',
    ],
  },

  // Allowed. Heated news talk, criticism of public figures, everyday chat,
  // and people mentioning their own identity.
  safe: {
    label: 'allowed',
    examples: [
      // criticism of governments, leaders and ideas
      'the prime minister is a liar and a disgrace',
      'this government is completely corrupt',
      'that new law is an absolute disaster',
      'the president has no idea what he is doing',
      'this policy will destroy the economy',
      'their foreign policy is a total failure',
      'that minister should resign immediately',
      // disagreeing with someone without attacking them
      'I completely disagree with you',
      "that's a terrible take, here's why",
      "I think you're wrong about the economy",
      'have you read the actual report? it says the opposite',
      // reporting violent news
      'the attack killed twelve people yesterday',
      'troops were sent to the border this morning',
      'the earthquake destroyed hundreds of homes',
      'police arrested three suspects after the shooting',
      // everyday chat
      'hello from Brazil!',
      'what is the latest news here?',
      'this is such an interesting country',
      'lol that is hilarious',
      'thanks for sharing that article',
      'anyone watching the election results?',
      // mentioning one's own identity
      "as a gay man, I think this law matters a lot",
      "I'm Muslim and I celebrate Eid with my family",
      'as an immigrant, I have mixed feelings about this',
      'my grandparents were refugees from this country',
      // sports trash talk
      'our team is going to destroy yours tonight',
      'that referee was blind, terrible match',
    ],
  },
};

module.exports = { CATEGORIES };
