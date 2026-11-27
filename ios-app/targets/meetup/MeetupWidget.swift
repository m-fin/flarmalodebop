import WidgetKit
import SwiftUI

private let appGroup = "group.app.flarmalodebop.ios"

struct MeetupPayload: Codable {
  var spot: String
  var when: String
  var ride: String
  var confirmed: Bool
}

struct MeetupEntry: TimelineEntry {
  let date: Date
  let meetup: MeetupPayload?
}

struct MeetupProvider: TimelineProvider {
  func placeholder(in context: Context) -> MeetupEntry {
    MeetupEntry(
      date: Date(),
      meetup: MeetupPayload(spot: "Golden Corral", when: "Today · 2:00–3:30 PM", ride: "Frog drives", confirmed: true)
    )
  }

  func getSnapshot(in context: Context, completion: @escaping (MeetupEntry) -> Void) {
    completion(load())
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<MeetupEntry>) -> Void) {
    let entry = load()
    let next = Calendar.current.date(byAdding: .minute, value: 15, to: Date()) ?? Date().addingTimeInterval(900)
    completion(Timeline(entries: [entry], policy: .after(next)))
  }

  func load() -> MeetupEntry {
    let defaults = UserDefaults(suiteName: appGroup)
    guard
      let raw = defaults?.string(forKey: "todayMeetup"),
      let data = raw.data(using: .utf8),
      let meetup = try? JSONDecoder().decode(MeetupPayload.self, from: data),
      meetup.confirmed
    else {
      return MeetupEntry(date: Date(), meetup: nil)
    }
    return MeetupEntry(date: Date(), meetup: meetup)
  }
}

struct MeetupWidgetView: View {
  var entry: MeetupProvider.Entry

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text("Today's restaurant meetup")
        .font(.caption.weight(.bold))
        .foregroundStyle(Color(red: 1, green: 0.784, blue: 0.380))
      if let meetup = entry.meetup {
        Text(meetup.spot)
          .font(.headline)
        Text(meetup.when)
          .font(.subheadline)
        if !meetup.ride.isEmpty {
          Text(meetup.ride)
            .font(.caption)
            .opacity(0.75)
        }
      } else {
        Text("Nothing locked in yet")
          .font(.headline)
        Text("Propose one in Flarmo")
          .font(.caption)
          .opacity(0.75)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .padding()
    .containerBackground(for: .widget) {
      Color(red: 0.165, green: 0.071, blue: 0.251)
    }
  }
}

struct TodaysMeetup: Widget {
  let kind = "TodaysMeetup"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: MeetupProvider()) { entry in
      MeetupWidgetView(entry: entry)
    }
    .configurationDisplayName("Today's Restaurant Meetup")
    .description("The restaurant meetup locked in for today.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}

@main
struct MeetupWidgetBundle: WidgetBundle {
  var body: some Widget {
    TodaysMeetup()
  }
}
