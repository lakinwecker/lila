package lila.tutor

import cats.data.NonEmptyList
import scala.concurrent.ExecutionContext

import lila.insight.*
import lila.rating.PerfType
import lila.common.config
import lila.db.dsl.{ *, given }
import lila.rating.BSONHandlers.perfTypeIdHandler
import lila.insight.{ Insight, Cluster, Answer, InsightStorage, Point }
import lila.insight.InsightEntry.{ BSONFields as F }
import lila.insight.BSONHandlers.given

object TutorClockUsage:

  val maxGames = config.Max(10_000)

  private[tutor] def compute(
      users: NonEmptyList[TutorUser]
  )(using insightApi: InsightApi, ec: ExecutionContext): Fu[TutorBuilder.Answers[PerfType]] =
    val perfs = users.toList.map(_.perfType)
    val question = Question(
      InsightDimension.Perf,
      InsightMetric.ClockPercent,
      List(Filter(InsightDimension.Perf, perfs))
    )
    def clusterParser(docs: List[Bdoc]) = for {
      doc          <- docs
      perf         <- doc.getAsOpt[PerfType]("_id")
      clockPercent <- doc.getAsOpt[ClockPercent]("cp")
      size         <- doc.int("nb")
    } yield Cluster(perf, Insight.Single(Point(100 - clockPercent.value)), size, Nil)
    def aggregate(select: Bdoc, sort: Boolean) = insightApi.coll {
      _.aggregateList(maxDocs = Int.MaxValue) { framework =>
        import framework.*
        Match($doc(F.result -> Result.Loss.id, F.perf $in perfs) ++ select) -> List(
          sort option Sort(Descending(F.date)),
          Limit(maxGames.value).some,
          Project($doc(F.perf -> true, F.moves -> $doc("$last" -> s"$$${F.moves}"))).some,
          UnwindField(F.moves).some,
          Project($doc(F.perf -> true, "cp" -> s"$$${F.moves}.s")).some,
          GroupField(F.perf)("cp" -> AvgField("cp"), "nb" -> SumAll).some,
          Project($doc(F.perf -> true, "nb" -> true, "cp" -> $doc("$toInt" -> "$cp"))).some
        ).flatten
      }
    }
    val monitoringKey = "clock_usage"
    for {
      mine <- aggregate(InsightStorage.selectUserId(users.head.user.id), true)
        .map { docs => TutorBuilder.AnswerMine(Answer(question, clusterParser(docs), Nil)) }
        .monSuccess(_.tutor.askMine(monitoringKey, "all"))
      peer <- aggregate(InsightStorage.selectPeers(Question.Peers(users.head.perfStats.rating)), false)
        .map { docs => TutorBuilder.AnswerPeer(Answer(question, clusterParser(docs), Nil)) }
        .monSuccess(_.tutor.askPeer(monitoringKey, "all"))
    } yield TutorBuilder.Answers(mine, peer)
